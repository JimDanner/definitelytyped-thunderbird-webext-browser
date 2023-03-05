/**
 * Generates typescript definitions for webextension development in thunderbird.
 *
 * See ../README.md for usage.
 *
 * @author Jasmin Bom, Jim Danner
 */

import minimist from 'minimist';
import Converter from './converter';
import override from './overrides';
import fs from 'fs';
import path from 'path';

const API_DIR        = 'APIs',
      METAINFO_DIR   = 'metainfo',
      TB_SCHEMA_DIR  = 'thunderbird-schemas',
      FF_SCHEMA_DIR  = 'gecko-schemas',
      MANIFEST_DOC   = 'https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json';

const argv = minimist(process.argv.slice(2), {
    string: ['tag', 'out'],
    boolean: ['webstorm'],
    default: {out: 'index.d.ts', webstorm: false},
    alias: { t: 'tag', version: 'tag', o: 'out', w: 'webstorm' },
});
let tb_tag: string = argv.tag;
if (!tb_tag) {
    try {  // the sync version, to use the result immediately after
        tb_tag = fs.readdirSync(path.resolve(API_DIR), {withFileTypes: true})
            .find((entry: fs.Dirent) => entry.isDirectory())?.name || '';
    } catch {}
    if (!tb_tag) {
        console.error(`No version tag given, none found in ${API_DIR} directory\nSee README.md for usage.`);
        process.exit(1);
    }
    console.log(`No version tag given. Using ${tb_tag} from ${API_DIR} directory`);
}

let tb_version: string = fs.readFileSync(path.resolve(API_DIR, tb_tag, METAINFO_DIR, 'version.txt'),
    {encoding: "utf-8"}).match(/^\w+(\.\w+)?/)?.[0] || tb_tag.match(/\d+/)?.[0] || '???';
console.log(`Thunderbird version number ${tb_version}`);

let namespaces_used: Record<string, string> = JSON.parse(fs.readFileSync(path.resolve(API_DIR, tb_tag,
    METAINFO_DIR, 'namespaces.json'), {encoding: "utf-8"}));
namespaces_used.manifest = MANIFEST_DOC;  // not listed on Thunderbird docs webpage

// Namespace references that need renaming
const NAMESPACE_ALIASES = { contextMenusInternal: 'menusInternal', manifest: '_manifest' };

// Header and footer of the definitions file
let HEADER = `// Type definitions for non-npm package WebExtension Development in Thunderbird ${tb_version}
// Project: https://webextension-api.thunderbird.net/en/stable/
// Definitions by: Jim Danner <https://github.com/JimDanner>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped
// TypeScript Version: 3.4
// Generated using script at github.com/JimDanner/definitelytyped-thunderbird-webext-browser
// derived from github.com/jsmnbom/definitelytyped-firefox-webext-browser by Jasmin Bom

interface WebExtEvent<TCallback extends (...args: any[]) => any> {
    addListener(cb: TCallback): void;
    removeListener(cb: TCallback): void;
    hasListener(cb: TCallback): boolean;
}

/**
 * **The root object of the WebExtension API for Thunderbird**
 *
 * Also known as the \`browser\` object. There are differences between the Thunderbird, Firefox, and generic WebExtension APIs.
 *
 * The Thunderbird API is documented at [thunderbird.net](https://webextension-api.thunderbird.net/en/stable/).
 * @version Thunderbird ${tb_version}
 */
`;

if (argv.webstorm) HEADER += `
const messenger;

/**
 * **The root object of the WebExtension API**
 *
 * In Thunderbird extensions, it is [recommended](https://webextension-api.thunderbird.net/en/stable/#thunderbird-webextension-api-documentation) to use \`messenger\` instead of \`browser\`, to remind yourself of the subtle differences between the Thunderbird, Firefox, and generic WebExtension APIs.
 * @version Thunderbird ${tb_version}
 */
const browser;

`;

HEADER += `declare namespace messenger {
`;

let FOOTER = '}\n';
if (!argv.webstorm) FOOTER += `
/**
 * **The root object of the WebExtension API**
 *
 * In Thunderbird extensions, it is [recommended](https://webextension-api.thunderbird.net/en/stable/#thunderbird-webextension-api-documentation) to use \`messenger\` instead of \`browser\`, to remind yourself of the subtle differences between the Thunderbird, Firefox, and generic WebExtension APIs.
 * @version Thunderbird ${tb_version}
 */
 import browser = messenger;
`;

// Conversion from schemas to .d.ts
let converter = new Converter([path.resolve(API_DIR, tb_tag, TB_SCHEMA_DIR),
    path.resolve(API_DIR, tb_tag, FF_SCHEMA_DIR)], HEADER, NAMESPACE_ALIASES, namespaces_used);

converter.setUnsupportedAsOptional();

console.log('\n\x1b[1mOverride\x1b[m');
override(converter);

console.log('\n\x1b[1mConvert\x1b[m');
converter.convert(FOOTER, argv.webstorm);

console.log('\n\x1b[1mWrite to file\x1b[m');
converter.write(argv.out);

console.log('\x1b[33m[DONE]\x1b[m');
