/**
 * Downloads webextension schemas from thunderbird and gecko source code.
 *
 * See ../README.md for usage.
 *
 * @author Jasmin Bom, Jim Danner
 */

'use strict';

import request from 'request';
import unzipper, {Entry} from 'unzipper';
import fs from 'fs';
import path from 'path';

// @ts-ignore
import {Writer} from 'fstream';  // file writer that also creates the containing directory tree
import minimist from 'minimist';
import {HTMLElement, parse} from 'node-html-parser';

const argv = minimist(process.argv.slice(2), {
  string: ['tag'],
  alias: { t: 'tag' },
});
const tb_tag = argv['tag'];
if (!tb_tag) {
    console.error('No version tag\nSee README.md for usage information.');
    process.exit(1);
}
let gecko_tag: string;



const TB_BASE_URL  = 'https://hg.mozilla.org/try-comm-central',
      TB_DOC_URL   = 'https://webextension-api.thunderbird.net/en/stable/',
      FF_BASE_URL  = 'https://hg.mozilla.org/mozilla-unified',
      API_DIR      = 'APIs',
      METAINFO_DIR = 'metainfo',
      TB_SCHEM_DIR = 'thunderbird-schemas',
      FF_SCHEM_DIR = 'gecko-schemas';

/** absolute path where this API will be saved */
const out_dir = path.resolve(API_DIR, tb_tag);

/**
 * details of a desired download
 * @property {string} descr - description of the download
 * @property {'file' | 'archive'} type - whether it is a single file or a ZIP archive
 * @property {string} save_to - subdirectory where it must be saved
 * @property {string} url - where it must be downloaded from
 */
type dl_data = {
    descr: string,
    type: 'file' | 'archive',
    save_to: string,
    url: string
};

/**
 * details of an API schema listed on thunderbird.net
 * @property {string} name - name by which it is listed in the table
 * @property {string} doc_url - the link on the name in the listing
 */
type namespace_link = {
    name: string,
    doc_url: string
}
// Step 1: download the metadata files
// TODO: perhaps adjust API homepage URL to Thunderbird version;

//  problem is that the page doesn't exist for every TB version.
const meta_info: dl_data[] = [
    {descr: 'version number', type: 'file', save_to: METAINFO_DIR,
        url: `${TB_BASE_URL}/raw-file/${tb_tag}/mail/config/version.txt`},
    {descr: 'Gecko version tag', type: 'file', save_to: METAINFO_DIR,
        url: `${TB_BASE_URL}/raw-file/${tb_tag}/.gecko_rev.yml`},
    {descr: 'API homepage', type: 'file', save_to: METAINFO_DIR,
        url: TB_DOC_URL},
];
const meta_urls = meta_info.map(item => item.url);

download(meta_info);

// Step 2: download the API archives
const api_files: dl_data[] = [{
    descr: 'Thunderbird JSON schemas',
    type: 'archive',
    save_to: TB_SCHEM_DIR,
    url: `${TB_BASE_URL}/archive/${tb_tag}.zip/mail/components/extensions/schemas/`
}];
let api_urls: string[];


function proceed_with_metainfo(completed_url: string): void {
    if (!meta_urls.length) return;  // this is not one of the files this function is concerned with
    meta_urls.splice(meta_urls.indexOf(completed_url), 1)
    if (meta_urls.length) return;   // start working when all files have been downloaded

    // extract the Gecko tag, then see if the Firefox version exists. if not, use the default
    gecko_tag = fs.readFileSync(path.join(out_dir, METAINFO_DIR, '.gecko_rev.yml'), {encoding: "utf-8"})
        .match(/GECKO_HEAD_REF: \S+\n/)?.[0].replace(/GECKO_HEAD_REF: (\S+)\n/, '$1')
        || 'default';
    console.log(`Gecko version tag: ${gecko_tag}`);
    api_files.push({
        descr: 'Gecko JSON schemas',
        type: 'archive',
        save_to: FF_SCHEM_DIR,
        url: `${FF_BASE_URL}/archive/${gecko_tag}.zip/toolkit/components/extensions/schemas/`
    });
    api_urls = api_files.map(item => item.url);
    download(api_files);
}

// Step 3: download missing API schemas

function get_missing_schemas(completed_url: string): void {
    if (!api_urls.length) return;  // this is not one of the files this function is concerned with
    api_urls.splice(api_urls.indexOf(completed_url), 1)
    if (api_urls.length) return;   // start working when all files have been downloaded

    const api_home_root = parse(fs.readFileSync(path.join(out_dir, METAINFO_DIR, path.basename(TB_DOC_URL)),
        {encoding: "utf-8"}));
    let tb_namespaces: namespace_link[] = [], gecko_namespaces: namespace_link[] = [];
    api_home_root.getElementsByTagName('tbody').forEach(tbody_el => {
        if (tbody_el.parentNode.previousElementSibling.textContent.includes('MailExtension'))
            tb_namespaces = read_table(tbody_el);
        else if (tbody_el.parentNode.previousElementSibling.textContent.includes('Firefox'))
            gecko_namespaces = read_table(tbody_el);
    });
    const missing_filenames: string[] = [];
    // check whether we have everything in gecko_namespaces; put missing ones on the list
    gecko_namespaces.forEach(ns => {
        let filenm = snake_case(ns.name)+'.json';
        if (filenm == 'protocol_handlers.json') filenm = 'extension_protocol_handlers.json';
        if (!fs.existsSync(path.join(out_dir, FF_SCHEM_DIR, filenm)))
            missing_filenames.push(filenm);
    });
    const missing_files = missing_filenames.map(name => {
        return {
            descr: `Gecko JSON schema ${name}`,
            type: 'file',
            save_to: FF_SCHEM_DIR,
            url: `${FF_BASE_URL}/raw-file/${gecko_tag}/browser/components/extensions/schemas/${name}`
        } as dl_data
    });
    download(missing_files);
    Writer({path: path.join(out_dir, METAINFO_DIR, 'namespaces.json')})
        .write(JSON.stringify({'tb': tb_namespaces, 'gecko': gecko_namespaces}, null, '\t'));
}

function read_table(body: HTMLElement): namespace_link[] {
     return body.querySelectorAll('td:first-child a').map(cell => {
         let link = cell.attributes.href;
         if (!link.startsWith('http'))
             link = TB_DOC_URL + link;
         return {
           name: cell.textContent,
           doc_url: link
         } as namespace_link
     })
}

/**
 * The `snakeCase` function from *lodash* puts underscores around numbers: i_18_n
 * @param s camel-case string that is to be converted
 */
function snake_case(s: string): string {
    return s.split('')
        .reduce((t, l) => t + (l.match(/[A-Z]/) ? '_'+l.toLowerCase() : l), '')
}

function download(items: dl_data[]): void {
    items.forEach(item => {
        console.log(`Downloading ${item.descr}\n\tto ${path.join(API_DIR, tb_tag, item.save_to)}/`);
        // TODO: error checking on the download process (e.g. THUNDERBIRD_78_10_1_RELEASE has
        //  a Gecko version FIREFOX_78_10_1esr_BUILD1 that's not available anymore => status 404)
        switch (item.type) {
            case "archive":
                request(item.url)
                    .pipe(unzipper.Parse())
                    .on('entry', (entry: Entry) => {
                        const filename = path.basename(path.normalize(entry.path));
                        entry.pipe(Writer({path: path.join(out_dir, item.save_to, filename)}));
                    })
                    .on('close', () => get_missing_schemas(item.url));
                break;
            case "file":
                const filename = path.posix.basename(item.url);  // works for URLs too. TODO: in Windows too?
                request(item.url)
                    .pipe(Writer({path: path.join(out_dir, item.save_to, filename)}))
                    .on('close', () => proceed_with_metainfo(item.url));
                break;
        }
    });
}
