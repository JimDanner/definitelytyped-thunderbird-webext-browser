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
import tb_override from './tb-overrides';
import fs from 'fs';
import path from 'path';

const API_DIR        = 'APIs',
      METAINFO_DIR   = 'metainfo',
      TB_SCHEMA_DIR  = 'thunderbird-schemas',
      FF_SCHEMA_DIR  = 'gecko-schemas';

const argv = minimist(process.argv.slice(2), {
    string: ['tag', 'out'],
    boolean: ['webstorm'],
    default: {webstorm: false},
    alias: { t: 'tag', version: 'tag', o: 'out', w: 'webstorm' },
});
const outfile: string = argv.out || `OUTPUT/${argv.webstorm ? 'WebStorm' : 'VSCode'}/index.d.ts`;
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

// Namespace references that need renaming
const NAMESPACE_ALIASES = { contextMenusInternal: 'menusInternal', manifest: '_manifest' };

// Header, intermediate part and footer of the definitions file
const HEADER = `interface WebExtEvent<TCallback extends (...args: any[]) => any> {
    addListener(cb: TCallback): void;
    removeListener(cb: TCallback): void;
    hasListener(cb: TCallback): boolean;
}

/**
 * **The root object of the WebExtension API for Thunderbird**
 *
 * Also known as the \`browser\` object. There are differences between the Thunderbird,
 * Firefox, and generic WebExtension APIs.
 *
 * The Thunderbird API is documented at
 * [thunderbird.net](https://webextension-api.thunderbird.net/en/latest/).
 *
 * @version Thunderbird ${tb_version}
 */
`
+ (argv.webstorm ? `
const messenger;
` : '')
+ `declare namespace messenger {
`;

const INBETWEEN = `
}

/**
 * **The root object of the WebExtension API**
 *
 * In Thunderbird extensions, it is
 * [recommended](https://webextension-api.thunderbird.net/en/latest/#thunderbird-webextension-api-documentation)
 * to use \`messenger\` instead of \`browser\`, to remind yourself of the subtle
 * differences between the Thunderbird, Firefox, and generic WebExtension APIs.
 *
 * @version Thunderbird ${tb_version}
 */
`
+ (argv.webstorm ? `
const browser;
` : '')
+ `declare namespace browser {
`;

const FOOTER = '}\n';

// Conversion from schemas to .d.ts
let converter = new Converter([path.resolve(API_DIR, tb_tag, TB_SCHEMA_DIR),
    path.resolve(API_DIR, tb_tag, FF_SCHEMA_DIR)], '', NAMESPACE_ALIASES, namespaces_used);

converter.setUnsupportedAsOptional();

console.log('\n\x1b[1mOverride\x1b[m');
override(converter);
tb_override(converter);

console.log('\n\x1b[1mConvert\x1b[m');
console.debug(`[Error messages that are non-breaking:
 - AddressBookNode is within the parent scope of the place where it's used; no error
 - requestUpdateCheck is not implemented yet
 - DirectoryEntry is not implemented and only used in a deprecated function]`);
converter.convert(HEADER, INBETWEEN, FOOTER, argv.webstorm);

console.log('\n\x1b[1mWrite to file\x1b[m');
converter.write(outfile);

console.log('\x1b[33m[DONE]\x1b[m');
