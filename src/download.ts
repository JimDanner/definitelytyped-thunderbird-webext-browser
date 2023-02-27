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
import {Writer} from 'fstream';
import minimist from 'minimist';

const argv = minimist(process.argv.slice(2), {
  string: ['tag'],
  alias: { t: 'tag' },
});
const tb_tag = argv['tag'];
if (!tb_tag) {
    console.error('No version tag\nSee README.md for usage information.');
    process.exit(1);
}

const TB_BASE_URL = 'https://hg.mozilla.org/try-comm-central',
    TB_DOC_URL = 'https://webextension-api.thunderbird.net/en/latest',
    FF_BASE_URL = 'https://hg.mozilla.org/mozilla-unified';

const API_DIR = 'APIs';
const out_dir = path.resolve(API_DIR, tb_tag);
fs.mkdirSync(out_dir, {recursive: true});

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

const meta_info: dl_data[] = [
    {descr: 'Version number', type: 'file', save_to: 'metainfo',
        url: `${TB_BASE_URL}/raw-file/${tb_tag}/mail/config/version.txt`},
    {descr: 'Gecko version tag', type: 'file', save_to: 'metainfo',
        url: `${TB_BASE_URL}/raw-file/${tb_tag}/.gecko_rev.yml`},
    {descr: 'API homepage', type: 'file', save_to: 'metainfo',
        url: TB_DOC_URL},
];
download(meta_info);

const api_files: dl_data[] = [];
api_files.push({
    descr: 'Thunderbird JSON schemas',
    type: 'archive',
    save_to: 'thunderbird-schemas',
    url: `${TB_BASE_URL}/archive/${tb_tag}.zip/mail/components/extensions/schemas/`
});

// extract the Gecko tag, then see if the Firefox version exists. if not, use the default
let gecko_tag = 'FIREFOX_102_7_0esr_BUILD1';

api_files.push({
    descr: 'Gecko JSON schemas',
    type: 'archive',
    save_to: 'gecko-schemas',
    url: `${FF_BASE_URL}/archive/${gecko_tag}.zip/toolkit/components/extensions/schemas/`
});
download(api_files);

const missing_filenames: string[] = [];
// check whether we now have everything of the list on the webpage; put missing ones on the list
const missing_files = missing_filenames.map(name => {
    return {
        descr: `Gecko JSON schema ${name}`,
        type: 'file',
        save_to: 'gecko-schemas',
        url: `${FF_BASE_URL}/raw-file/${gecko_tag}/browser/components/extensions/schemas/${name}`
    } as dl_data
});
download(missing_files);

function download(items: dl_data[]): void {
    items.forEach(item => {
        console.log('Downloading', item.descr);
        const save_dir = path.join(out_dir, item.save_to);
        console.log('   to', save_dir);
        fs.mkdirSync(save_dir, {recursive: true});
        // TODO: error checking on the download process
        switch (item.type) {
            case "archive":
                request(item.url)
                    .pipe(unzipper.Parse())
                    .on('entry', (entry: Entry) => {
                        const filename = path.basename(path.normalize(entry.path));
                        entry.pipe(Writer({path: path.join(save_dir, filename)}));
                    });
                break;
            case "file":
                const filename = path.basename(item.url);  // works for URLs too. TODO: in Windows too?
                request(item.url)
                    .pipe(fs.createWriteStream(path.join(save_dir, filename)));
                    // TODO: check whether this could be Writer, too
                break;
        }
    });
}
