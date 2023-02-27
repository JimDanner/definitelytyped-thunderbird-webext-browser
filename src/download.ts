/**
 * Downloads webextension schemas from thunderbird and gecko source code.
 *
 * See ../README.md for usage.
 *
 * @author Jasmin Bom, Jim Danner
 */

'use strict';

import request from 'request';
import unzipper, { Entry } from 'unzipper';
import fs from 'fs';
import path from 'path';
// @ts-ignore
import { Writer } from 'fstream';
import minimist from 'minimist';

const argv = minimist(process.argv.slice(2), {
  string: ['tag'],
  alias: { t: 'tag' },
});

const API_DIR = 'APIs';
const outdir = path.resolve(API_DIR, argv['tag']);
fs.mkdirSync(outdir, {recursive: true});

const tb_url = `https://hg.mozilla.org/try-comm-central/raw-file/${argv['tag']}`;
const doc_url = 'https://webextension-api.thunderbird.net/en/latest/';

/**
 * data of a desired download
 * @property {string} descr - description of the download
 * @property {'file' | 'archive'} type - whether it is a single file or a ZIP archive
 * @property {string} save_to - directory where it must be saved
 * @property {string} url - where it must be downloaded from
 */
type dl_data = {
    descr: string,
    type: 'file' | 'archive',
    save_to: string,
    url: string
};

const downloads: dl_data[] = [
    {descr: 'Version number', type: 'file', save_to: 'metainfo', url: `${tb_url}/mail/config/version.txt`},
    {descr: 'Gecko version tag', type: 'file', save_to: 'metainfo', url: `${tb_url}/.gecko_rev.yml`},
    {descr: 'API homepage', type: 'file', save_to: 'metainfo', url: doc_url},
];

// now download these files
download(downloads);

downloads.push({
    descr: 'Thunderbird JSON files',
    type: 'archive',
    save_to: 'thunderbird-schemas',
    url: `https://hg.mozilla.org/try-comm-central/archive/${argv['tag']}.zip/mail/components/extensions/schemas/`
});

// extract the Gecko tag, then see if the Firefox version exists. if not, use the default
let gecko_tag = 'FIREFOX_102_7_0esr_BUILD1';
downloads.push({
    descr: 'Gecko JSON files',
    type: 'archive',
    save_to: 'gecko-schemas',
    url: `https://hg.mozilla.org/mozilla-unified/archive/${gecko_tag}.zip/toolkit/components/extensions/schemas/`
});
download(downloads);

// check whether we now have everything of the list on the webpage; otherwise, download more

// TODO: error checking on the download process

function download(items: dl_data[]): void {
    while (items.length) {
        let item = items.pop();
        console.log('Downloading ', item.descr);
        const dir = path.join(outdir, item.save_to);
        console.log('   to', dir);
        fs.mkdirSync(dir, {recursive: true});
        switch (item.type) {
            case "archive":
                request(item.url)
                    .pipe(unzipper.Parse())
                    .on('entry', (entry: Entry) => {
                        let [, component, , , , ...rest] = path.normalize(entry.path).split(path.sep);
                        const stripped_path = path.join(dir, component, ...rest);
                        entry.pipe(Writer({path: stripped_path}));
                    });
                break;
            case "file":
                const filename = item.url.replace(/\/$/, '').split('/').slice(-1)[0];
                request(item.url)
                    .pipe(fs.createWriteStream(path.join(dir, filename)));
                break;
        }
    }
}
