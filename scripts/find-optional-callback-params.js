const fs= require("fs");
const path= require("path");
const minimist = require("minimist");
const stripJsonComments = require("strip-json-comments");
const TB_SCHEMA_DIR = 'thunderbird-schemas',
      FF_SCHEMA_DIR = 'gecko-schemas',
      API_DIR       = 'APIs';

const argv = minimist(process.argv.slice(2), {
    string: ['tag'],
    alias: { t: 'tag', version: 'tag' },
});
let tb_tag = argv.tag;
if (!tb_tag) {
    try {  // the sync version, to use the result immediately after
        tb_tag = fs.readdirSync(path.resolve(API_DIR), {withFileTypes: true})
            .find((entry) => entry.isDirectory())?.name || '';
    } catch {}
    if (!tb_tag) {
        console.error(`No version tag given, none found in ${API_DIR} directory\nSee README.md for usage.`);
        process.exit(1);
    }
    console.log(`No version tag given. Using ${tb_tag} from ${API_DIR} directory`);
}

function printOptCBParamsInDir(directory) {
    fs.readdirSync(path.join(API_DIR, tb_tag, directory), {withFileTypes: true})
        .forEach(file => {
            if (!file.name.endsWith('.json')) return;
            const fileWithoutComments = stripJsonComments(fs.readFileSync(path.join(API_DIR, tb_tag, directory, file.name), 'utf8'));
            const api = JSON.parse(fileWithoutComments);
            for (let ns of api) {
                if (!('functions' in ns)) continue;
                for (let f of ns.functions) {
                    if (!f.parameters.length || f.parameters.slice(-1)[0].name !== 'callback') continue;
                    if (!f.parameters.slice(-1)[0].parameters?.[0]?.optional) continue;
                    console.log(`Optional callback parameter in ${ns.namespace}.${f.name}\n\t${f.description}`);
                }
            }
        })
}

printOptCBParamsInDir(TB_SCHEMA_DIR);
printOptCBParamsInDir(FF_SCHEMA_DIR);

