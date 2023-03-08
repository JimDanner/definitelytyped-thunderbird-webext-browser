// noinspection JSIgnoredPromiseFromCall

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
import {Writer} from 'fstream'; // file writer that also creates the containing directory tree
import minimist from 'minimist';
import {HTMLElement, parse} from 'node-html-parser';

const argv = minimist(process.argv.slice(2), {
  string: ['tag'],
  alias: { t: 'tag' },
});
if (!argv.tag)
    exit_with_error_message('No version tag\nSee README.md for usage information.');

let gecko_tag: string;
const version_from_tag: string = argv.tag.match(/\d+/)?.[0] || '';

const TB_BASE_URL    = 'https://hg.mozilla.org/try-comm-central',
      TB_DOC_URL     = 'https://webextension-api.thunderbird.net/en/',
      TB_DEFAULT_VER = 'latest',
      FF_BASE_URL    = 'https://hg.mozilla.org/mozilla-unified',
      API_DIR        = 'APIs',
      METAINFO_DIR   = 'metainfo',
      TB_SCHEMA_DIR  = 'thunderbird-schemas',
      FF_SCHEMA_DIR  = 'gecko-schemas',
      BASIC_APIS: Record<string, string> = {
          // not in the table on the Thunderbird WebExtensions documentation webpage:
          events: 'https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/events',
          experiments: 'https://webextension-api.thunderbird.net/en/latest/how-to/experiments.html',
          extensionTypes: 'https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/extensionTypes',
          manifest: 'https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json',
          'privacy.network': 'https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/privacy/network',
          'privacy.services': 'https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/privacy/services',
          'privacy.websites': 'https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/privacy/websites',
          types: 'https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/types',
      }

/** absolute path where this API will be saved */
const out_dir = path.resolve(API_DIR, argv.tag);

run_download_procedure();

async function run_download_procedure() {
    // Step 1: download the metadata files

    // determine whether this TB version has its own documentation page
    let tb_documentation: string;
    if (version_from_tag) {
        tb_documentation = `${TB_DOC_URL}${version_from_tag}`;
        if (!await url_works(tb_documentation)) {
            console.log(`No documentation webpage specific to version ${version_from_tag}`);
            console.log(`\tUsing default version '${TB_DEFAULT_VER}'`);
            tb_documentation = `${TB_DOC_URL}${TB_DEFAULT_VER}`;
        }
    } else {
        tb_documentation = `${TB_DOC_URL}${TB_DEFAULT_VER}`;
    }
    // download the meta-information files
    const meta_info: dl_data[] = [
        {descr: 'version number', type: 'file', save_to: METAINFO_DIR,
            url: `${TB_BASE_URL}/raw-file/${argv.tag}/mail/config/version.txt`},
        {descr: 'Gecko version tag', type: 'file', save_to: METAINFO_DIR,
            url: `${TB_BASE_URL}/raw-file/${argv.tag}/.gecko_rev.yml`},
        {descr: 'API homepage', type: 'file', save_to: METAINFO_DIR,
            url: tb_documentation},
    ];
    await Promise.all(meta_info.map(download));
    console.log('\x1b[33m[DONE]\x1b[m');

    // extract the Gecko tag, then see if that Firefox version exists; if not, use the default
    gecko_tag = fs.readFileSync(path.join(out_dir, METAINFO_DIR, '.gecko_rev.yml'), {encoding: "utf-8"})
        .match(/GECKO_HEAD_REF: \S+\n/)?.[0].replace(/GECKO_HEAD_REF: (\S+)\n/, '$1')
        || 'default';
    if (await url_works(`${FF_BASE_URL}/raw-file/${gecko_tag}`)) {
        console.log(`Gecko version tag: ${gecko_tag}`);
    } else {
        console.warn(`Gecko version ${gecko_tag} is not available. Using 'default'`);
        gecko_tag = 'default';
    }

    // Step 2: download the API archives

    const api_files: dl_data[] = [
        {descr: 'Thunderbird JSON schemas', type: 'archive', save_to: TB_SCHEMA_DIR,
            url: `${TB_BASE_URL}/archive/${argv.tag}.zip/mail/components/extensions/schemas/`},
        {descr: 'Gecko JSON schemas', type: 'archive', save_to: FF_SCHEMA_DIR,
            url: `${FF_BASE_URL}/archive/${gecko_tag}.zip/toolkit/components/extensions/schemas/`},
    ];
    await Promise.all(api_files.map(download));
    console.log('\x1b[33m[DONE]\x1b[m');

    // Step 3: download any missing API schemas and save a JSON file of namespaces

    const api_home_DOM_root = parse(fs.readFileSync(path.join(out_dir, METAINFO_DIR,
        path.basename(tb_documentation)), {encoding: "utf-8"}));
    let tb_namespaces: Record<string, string> = {},
        gecko_namespaces: Record<string, string> = {};
    api_home_DOM_root.getElementsByTagName('tbody').forEach(tbody_el => {
        if (tbody_el.parentNode.previousElementSibling.textContent.includes('MailExtension'))
            tb_namespaces = read_table(tbody_el, tb_documentation);
        else if (tbody_el.parentNode.previousElementSibling.textContent.includes('Firefox'))
            gecko_namespaces = read_table(tbody_el);
    });
    Object.assign(gecko_namespaces, BASIC_APIS);
    const missing_filenames: string[] = [];
    // check whether we have everything in gecko_namespaces; put missing ones on the list
    Object.keys(gecko_namespaces).forEach(ns => {
        if (ns.includes('.')) return;  // privacy.network etc. don't have their own files
        let filenm = snake_case(ns)+'.json';
        if (filenm == 'protocol_handlers.json') filenm = 'extension_protocol_handlers.json';
        if (!fs.existsSync(path.join(out_dir, FF_SCHEMA_DIR, filenm)))
            missing_filenames.push(filenm);
    });
    // download the missing files from the Gecko source code
    if (missing_filenames.length) {
        const missing_files = missing_filenames.map(name => {
            return {
                descr: `Gecko JSON schema ${name}`,
                type: 'file',
                save_to: FF_SCHEMA_DIR,
                url: `${FF_BASE_URL}/raw-file/${gecko_tag}/browser/components/extensions/schemas/${name}`
            } as dl_data
        });
        await Promise.all(missing_files.map(download));
        console.log('\x1b[33m[DONE]\x1b[m');
    }
    // create a JSON file of the namespaces and their documentation URLs
    console.log('Writing namespace data to file')
    Writer({path: path.join(out_dir, METAINFO_DIR, 'namespaces.json')})
        .write(JSON.stringify({...tb_namespaces, ...gecko_namespaces}, null, '\t'))
}

/**
 * Get the names and links of the namespaces on the Thunderbird documentation website
 * @param tbody the root DOM element of the page
 * @param [base_url] URL with which the links should begin for the TB documentation
 */
function read_table(tbody: HTMLElement, base_url?: string): Record<string, string> {
    const result: Record<string, string> = {};
    tbody.querySelectorAll('td:first-child a').forEach(cell => {
        let link = cell.attributes.href;
        if (!link.startsWith('http') && base_url)
            link = base_url + '/' + link;
        result[cell.textContent] = link;
     })
    return result;
}

/**
 * The `snakeCase` function from *lodash* puts underscores around numbers: i_18_n
 * @param s camel-case string that is to be converted
 */
function snake_case(s: string): string {
    if (!s) return '';
    return s[0].toLowerCase() + s.slice(1).split('')
        .reduce((r, c) => r + (c.match(/[A-Z]/) ? '_'+c.toLowerCase() : c), '')
}

function exit_with_error_message(msg: string, errcode: number = 1): never {
    console.error(msg);
    process.exit(errcode);
}

/**
 * Check whether a URL is available (i.e. it gives status code **200 OK**).
 * Terminates the program if there's an operational error (not if the status code is ≥ 300)
 * @param {string} url the URL to check
 */
async function url_works(url: string): Promise<boolean> {
    return new Promise(function(successCallback) {
        request.head(url, (err, status) => {
            if (err) exit_with_error_message(`Error connecting to ${url}: ${err.toString()}`, 2);
            else successCallback(status?.statusCode === 200)
        })
    })
}

/**
 * download a file, or download and expand a ZIP archive
 * @param item - details of the download: URL, where to save etc.
 * @return an empty promise
 */
async function download(item: dl_data): Promise<void> {
    console.log(`Downloading ${item.descr}
    from ${item.url}
    to ${path.join(API_DIR, argv.tag, item.save_to)}/`);
    return new Promise(function(successCallback) {
        const tcp_stream: request.Request = request(item.url)
            .on('error', err => {
                exit_with_error_message(`Error loading ${item.url}: ${err.toString()}`, 2)
            })
            .on('response', resp => {
                if (resp.statusCode >= 400)
                    exit_with_error_message(`Couldn't load ${item.url}: ${resp.statusMessage}`, 3)
            });
        switch (item.type) {
            case "file":
                const filename = path.basename(item.url);  // works for URLs too
                tcp_stream.pipe(Writer({path: path.join(out_dir, item.save_to, filename)}))
                    .on('close', successCallback);
                break;
            case "archive":
                tcp_stream.pipe(unzipper.Parse())
                    .on('entry', (entry: Entry) => {
                        const filename = path.basename(path.normalize(entry.path));
                        entry.pipe(Writer({path: path.join(out_dir, item.save_to, filename)}));
                    })
                    .on('close', successCallback);
                break;
        }
    });
}

