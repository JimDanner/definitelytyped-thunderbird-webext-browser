import * as fs from 'fs';
// @ts-ignore
import {Writer} from 'fstream'; // file writer that also creates the containing directory tree
import * as path from 'path';
const format: (text: string, opts: any) => string = require('prettier').format;

import stripJsonComments from 'strip-json-comments';
import * as _ from 'lodash';

import {descToMarkdown, toDocComment} from './desc-to-doc';

// Reserved keywords in typescript
const RESERVED = [
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'new',
  'null',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'Date',
];

//
const GLOBAL_TYPES = [
  'ImageData',
  'ArrayBuffer',
  'Element',
  'Uint8Array',
  'globalThis.Date',
  'Window',
  'File', // used in the Thunderbird API
  'AddressBookNode', // FIXME: the schema defines this as an interface, but the program doesn't detect
                     //  that, emits a warning, and defines a conflicting type AddressBookNode
                     //  while also correctly putting in the interface declaration
];

// Types that are considered "simple"
const SIMPLE_TYPES = ['string', 'integer', 'number', 'boolean', 'any', 'null'];
const ALREADY_OPTIONAL_RETURNS = ['any', 'undefined', 'void'];

// Readable names for "allowedContexts" values from the schema
const CONTEXT_NAMES: Indexable<string> = {
  addon_parent: 'Add-on parent',
  content: 'Content scripts',
  devtools: 'Devtools pages',
  proxy: 'Proxy scripts',
};

// Comment "X context only" for these contexts
const CTX_CMT_ONLY_ALLOWED_IN = ['content', 'devtools', 'proxy'];

// Comment "Not allowed in" for these contexts
const CTX_CMT_NOT_ALLOWED_IN = ['content', 'devtools'];

// Comment "Allowed in" for these contexts
const CTX_CMT_ALLOWED_IN = ['proxy'];

function pascalCase(s: string): string {
  return s
    .split('_')
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
    .join('');
}

// Formats an allowedContexts array to a readable string
function formatContexts(contexts: string[] | undefined, outputAlways = false) {
  if (!contexts || contexts.length === 0) {
    if (outputAlways) {
      // No contexts are specified, but we can likely still output something
      contexts = [];
    } else {
      return '';
    }
  }
  // Check if this thing is only allowed in one context
  for (let context of contexts) {
    if (/^(.*)_only$/.exec(context) && CTX_CMT_ONLY_ALLOWED_IN.includes(RegExp.$1)) {
      return `Allowed in: ${CONTEXT_NAMES[RegExp.$1]} only`;
    }
  }
  let lines = [];
  // If a context from CTX_CMT_NOT_ALLOWED_IN isn't in contexts, comment it as "not allowed in"
  let notAllowedIn = CTX_CMT_NOT_ALLOWED_IN.filter((context) => !contexts!.includes(context));
  if (notAllowedIn.length > 0) {
    lines.push(`Not allowed in: ${notAllowedIn.map((ctx) => CONTEXT_NAMES[ctx]).join(', ')}`);
  }
  // If a context from CTX_CMT_ALLOWED_IN is in contexts, comment it as "allowed in"
  let allowedIn = CTX_CMT_ALLOWED_IN.filter((context) => contexts!.includes(context));
  if (allowedIn.length > 0) {
    lines.push(`Allowed in: ${allowedIn.map((ctx) => CONTEXT_NAMES[ctx]).join(', ')}`);
  }
  return lines.length > 0 ? lines.join('\n\n') : '';
}

// Creates a doc comment out of a schema object
function commentFromSchema(schema: TypeSchema | NamespaceSchema | NameDesc) {
  const namespace = schema as NamespaceSchema;
  const type = schema as TypeSchema;

  const doclines = [];
  if (namespace.description) {
    doclines.push(descToMarkdown(namespace.description));
  }

  const contexts = formatContexts(namespace.allowedContexts);
  if (contexts) {
    // Separate with an empty line
    if (doclines.length > 0) doclines.push('');
    doclines.push(contexts);
  }

  if (type.parameters) {
    for (const param of type.parameters) {
      // '@param' is redundant in TypeScript code if it has no description.
      if (!param.description) continue;
      // Square brackets around optional parameter names is a jsdoc convention
      const name = param.optional ? `[${param.name}]` : param.name;
      const desc = param.description ? ' ' + descToMarkdown(param.description) : '';
      doclines.push(`@param ${name}${desc}`);
    }
  }
  if (type.deprecated) {
    let desc = type.deprecated;
    if (typeof desc !== 'string') {
      desc = type.description || '';
    }
    doclines.push(`@deprecated ${descToMarkdown(desc)}`);
  } else if (type.unsupported) {
    doclines.push(`@deprecated Unsupported on Firefox at this time.`);
  }
  if (type.min_manifest_version) {
    doclines.push(`Needs at least manifest version ${type.min_manifest_version}.`);
  }
  if (type.max_manifest_version) {
    doclines.push(`Not supported on manifest versions above ${type.max_manifest_version}.`);
  }
  if (type.returns && type.returns.description) {
    doclines.push(`@returns ${descToMarkdown(type.returns.description)}`);
  }
  if (doclines.length === 0) {
    return '';
  }
  return toDocComment(doclines.join('\n')) + '\n';
}

// Iterate over plain objects in nested objects and arrays
function* deepIteratePlainObjects(item: object): Iterable<object> {
  if (_.isArray(item)) {
    // Got an array, check its elements
    for (let x of item) {
      yield* deepIteratePlainObjects(x);
    }
  } else if (_.isPlainObject(item)) {
    // Got a plain object, yield it
    yield item;
    // Check its properties
    for (let x of Object.values(item)) {
      yield* deepIteratePlainObjects(x);
    }
  }
}

export default class Converter {
  out: string;
  readonly namespace_aliases: Indexable<string>;
  readonly schemaData: [string, NamespaceSchema[]][];
  readonly namespaces: Indexable<NamespaceSchema>;
  namespace: string = '';
  additionalTypes: string[] = [];
  types: string[] = [];
  properties: string[] = [];
  functions: string[] = [];
  events: string[] = [];
  webstorm: boolean | undefined;
  exp: '' | 'export ';

  constructor(folders: string[], initialString: string, namespace_aliases: Indexable<string>,
              allowed_namespaces?: Record<string, string>) {
    // Generated source
    this.out = initialString;
    this.exp = '';
    this.namespace_aliases = namespace_aliases;

    // Collect schema files
    this.schemaData = [];
    this.collectSchemas(folders);

    // Convert from split schemas to namespace
    // This merges all the properties that we care about for each namespace
    // Needed since many schema files add to the "manifest" namespace

    this.namespaces = {};
    for (let data of this.schemaData) {
      // Enumerate the actual namespace data
      for (let namespace of data[1]) {
        // Thunderbird: if it's not on the list, skip it
        if (allowed_namespaces && !allowed_namespaces.hasOwnProperty(namespace.namespace))
          continue;
        const doc_url: string | undefined = allowed_namespaces?.[namespace.namespace];
        // Check if we have an alias for it
        if (this.namespace_aliases.hasOwnProperty(namespace.namespace)) {
          namespace.namespace = this.namespace_aliases[namespace.namespace];
        }

        // If we haven't seen this namespace before, init it
        let resNamespace: NamespaceSchema;
        if (!this.namespaces.hasOwnProperty(namespace.namespace)) {
          resNamespace = {
            namespace: namespace.namespace,
            types: [],
            properties: {},
            functions: [],
            events: [],
            description: namespace.description,
            permissions: [],
            allowedContexts: [],
            min_manifest_version: namespace.min_manifest_version,
            max_manifest_version: namespace.max_manifest_version,
            docURL: doc_url,
          };
          this.namespaces[namespace.namespace] = resNamespace;
        } else {
          resNamespace = this.namespaces[namespace.namespace];
        }

        // Concat or extend namespace

        if (namespace.types) {
          resNamespace.types!.push(...namespace.types);
        }
        if (namespace.properties) {
          Object.assign(resNamespace.properties, namespace.properties);
        }
        if (namespace.functions) {
          resNamespace.functions!.push(...namespace.functions);
        }
        if (namespace.events) {
          resNamespace.events!.push(...namespace.events);
        }
        if (namespace.permissions) {
          resNamespace.permissions!.push(...namespace.permissions);
        }
        if (namespace.allowedContexts) {
          resNamespace.allowedContexts.push(...namespace.allowedContexts);
        }
        if (namespace.$import) {
          resNamespace.$import = namespace.$import;
        }
      }
    }
  }

  setUnsupportedAsOptional() {
    for (let type of deepIteratePlainObjects(this.namespaces) as TypeSchema[]) {
      if (type.unsupported) {
        type.optional = true;
      }
    }
  }

  convert(headertext: string = '', betweentext: string = '',
          footertext: string = '', webstorm: boolean = false) {
    this.webstorm = webstorm;
    this.exp = webstorm ? '' : 'export ';
    // For each namespace, set it as current, and convert it, which adds directly onto this.out
    for (let namespace of Object.keys(this.namespaces)) {
      // Thunderbird: nest the nested namespaces (like addressBooks.provider) in the output
      // this means for such namespaces running convertNamespace recursively, not from here.
      if (namespace.match(/\./)) continue;
      this.namespace = namespace;
      this.convertNamespace();
    }
    this.out = headertext + this.out + betweentext
        + this.out.replace(/\bmessenger\./g, 'browser.')
        + footertext;
  }

  collectSchemas(folders: string[]) {
    // For each schema file
    for (let folder of folders) {
      const files = fs.readdirSync(folder);
      for (let file of files) {
        if (path.extname(file) === '.json') {
          // Strip json comments, parse and add to data array
          let json = String(fs.readFileSync(path.join(folder, file)));
          json = stripJsonComments(json);
          this.schemaData.push([file, JSON.parse(json)]);
        }
      }
    }
  }

  // noinspection JSMethodCanBeStatic
  convertPrimitive(type: string) {
    if (type === 'integer') {
      return 'number';
    }
    return type;
  }

  convertClass(type: TypeSchema) {
    // Convert each property, function and event of a class
    let out = `{\n`;
    let convertedProperties = this.convertObjectProperties(type);
    if (type.functions)
      for (let func of type.functions) {
        convertedProperties.push(this.convertFunction(func, true, true));
      }
    if (type.events)
      for (let event of type.events) {
        convertedProperties.push(this.convertEvent(event, true));
      }
    out += `${convertedProperties.join(';\n') + ';'}`;
    out += `\n}`;

    return out;
  }

  convertObjectProperties(type: TypeSchema) {
    let convertedProperties = [];

    if (type.$import) {
      const imp = _.find(this.namespaces[this.namespace].types, (x: TypeSchema) => {
        // We need the split cause theme.json apparently has a "manifest.ManifestBase"
        // despite being in the manifest namespace already
        const imp = type.$import!.split('.')[0];
        return x.id === imp || x.name == imp;
      });
      // Merge it, preferring type values not imp, and making sure we don't have dupes in arrays
      _.mergeWith(type, imp, (objValue, srcValue, key) => {
        if (_.isArray(objValue)) {
          return _.uniqWith(objValue.concat(srcValue), (arrVal, othVal) => {
            return (
              (arrVal.id !== undefined && arrVal.id === othVal.id) ||
              (arrVal.name !== undefined && arrVal.name === othVal.name)
            );
          });
        }
        if (objValue !== undefined && !_.isObject(objValue)) {
          return objValue;
        }
      });
    }

    // For each simple property
    if (type.properties) {
      for (let name of Object.keys(type.properties)) {
        let propertyType = type.properties[name];
        // Make sure it has a proper id by adding parent id to id
        propertyType.id = type.id + (name === 'properties' ? '' : '_' + name);
        // Output property type (adding a ? if optional)
        let val = this.convertType(propertyType);
        if (val !== 'any' && type.properties[name].optional) val += ' | undefined';
        convertedProperties.push(
          `${commentFromSchema(propertyType)}${name}${
            type.properties[name].optional ? '?' : ''
          }: ${val}`
        );
      }
    }
    // For each pattern property
    if (type.patternProperties) {
      for (let name of Object.keys(type.patternProperties)) {
        // Assume it's a string type
        let keyType = 'string';
        // TODO: Simple regex check, probably flawed
        // If the regex has a \d and not a a-z, assume it's asking for a number
        if (name.includes('\\d') && !name.includes('a-z')) keyType = 'number';
        // Add the keyed property
        convertedProperties.push(
          `[key: ${keyType}]: ${this.convertType(type.patternProperties[name])}`
        );
      }
    }
    return convertedProperties;
  }

  convertRef(ref: string) {
    // Get the namespace of the reference, if any
    let namespace = ref.split('.')[0];
    // Do we have an alias for that namesapce?
    if (this.namespace_aliases.hasOwnProperty(namespace)) {
      // Revolve namespace aliases
      namespace = this.namespace_aliases[namespace];
      ref = `${namespace}.${ref.split('.')[1]}`;
    }
    // The namespace is unnecessary if it's the current one
    if (namespace === this.namespace) {
      ref = ref.split('.')[1];
    }
    // If we know about the namespace
    if (Object.keys(this.namespaces).includes(namespace)) {
      // Add browser. to the front
      // Okay, apparently typescript doesn't need that, as all the namepaces are combined by the compiler
      //out += 'browser.';
    } else if (!this.namespaces[this.namespace].types!.find((x) => x.id === ref)) {
      if (!GLOBAL_TYPES.includes(ref)) {
        console.error(
          `Cannot find reference "${ref}", fix or add tot GLOBAL_TYPES if browser knows it.`
        );
        // Add a type X = any, so the type can be used, but won't be typechecked
        this.additionalTypes.push(`type ${ref} = any;`);
      }
    }
    return ref;
  }

  convertType(type: TypeSchema, root = false): string {
    // Check if we've overridden it, likely for a type that can't be represented in json schema

    if (type.converterAdditionalType) {
      this.additionalTypes.push(type.converterAdditionalType);
      if (type.converterTypeOverride) {
        return type.converterTypeOverride;
      }
      if (type.id) {
        return type.id;
      }
    }
    if (type.converterTypeOverride) {
      return type.converterTypeOverride;
    }
    let out = '';
    // Check type of type
    if (type.choices) {
      // Okay so it's a choice between several types
      // Check if it's actually just a boolean
      if (
        _.every(
          type.choices.map((x) => x.type),
          (x) => x == 'boolean'
        )
      ) {
        return 'boolean';
      }
      // ¨Check if choices include enums, and if so combine them
      let choices: TypeSchema[] = [];
      let enums: Enum[] = [];
      for (let choice of type.choices) {
        if (choice.enum) {
          enums = enums.concat(choice.enum);
        } else {
          choices.push(choice);
        }
      }
      // If we found enums, output it as a single choice
      if (enums.length > 0)
        choices.push({
          id: type.id,
          enum: enums,
        });
      // For each choice, convert according to rules, join via a pipe "|" and add to output
      out += _.uniqWith(
        choices.map((x) => {
          // Override id with parent id for proper naming
          //x.id = type.id;
          // Convert it as a type
          let y = this.convertType(x);
          // If it's any, make it object instead and hope that works
          // This is due to how "string | any" === "any" and the whole choice would therefore be redundant
          if (y === 'any') y = 'object';
          return y;
        }),
        _.isEqual
      ).join(' | ');
    } else if (type.enum) {
      // If it's an enum
      // Make sure it has a proper id
      if (type.name && !type.id) type.id = type.name;

      // If there's only one option, then it's not a proper enum, so just output directly
      if (type.enum.length === 1) {
        out += `"${type.enum[0]}"`;
      } else {
        // We can only output enums in the namespace root (a schema enum, instead of e.g. a property having an enum
        // as type)
        if (root) {
          // So if we are in the root
          // Add each enum value, and format its comment
          const normalized = type.enum.map((x) => {
            if (typeof x !== 'string') {
              return {
                comment: commentFromSchema(x),
                value: x.name,
              };
            }
            return {
              comment: '',
              value: x,
            };
          });
          // Should it be output across multiple lines?
          // Yes if either more than 2 elements or we got multiple lines already
          const multiline =
            normalized.length > 2 || normalized.some((x) => x.comment.includes('\n'));
          if (multiline) out += '\n';
          // For each entry, join using | adding newlines as needed
          for (const [i, x] of normalized.entries()) {
            out += x.comment;
            out += i > 0 ? `|` : '';
            out += `"${x.value}"${multiline && i !== normalized.length - 1 ? '\n' : ''}`;
          }
          out += ';';
        } else {
          if (type.id) {
            const typeName = `_${pascalCase(type.id)}`;
            // If we're not in the root, add the enum as an additional type instead, adding an _ in front of
            // the name We convert the actual enum based on rules above by passing through the whole type code
            // again, but this time as root
            // As per https://github.com/DefinitelyTyped/DefinitelyTyped/issues/23002 don't use actual
            // typescript enums
            this.additionalTypes.push(
              `${commentFromSchema(type)}${this.exp}type ${typeName} = ${this.convertType(type, true)}`
            );
            // And then just reference it by name in output
            out += typeName;
          } else {
            // inline
            out += type.enum.map((x) => `"${x}"`).join(' | ');
          }
        }
      }
    } else if (type.type) {
      // The type has an actual type, check it
      if (type.type === 'object') {
        // It's an object, how is the object constructed?
        if (type.functions || type.events) {
          // It has functions or events, treat it as a class
          out += this.convertClass(type);
        } else if (type.properties || type.patternProperties) {
          // It has properties, convert those
          let properties = this.convertObjectProperties(type);
          // If it has no properties, just say it's some type of object
          if (properties.length > 0) {
            if (type.id && !root) {
              const typeName = `_${pascalCase(type.id!)}`;
              this.additionalTypes.push(
                `${commentFromSchema(type)}${this.exp}interface ${typeName} {\n${properties.join(';\n')};\n}`
              );
              // And then just reference it by name in output
              out += typeName;
            } else {
              out += `{\n${properties.join(';\n')};\n}`;
            }
          } else {
            out += 'object';
          }
        } else if (type.isInstanceOf) {
          // It's an instance of another type
          // Check if it's a window
          if (type.isInstanceOf == 'global') {
            out += 'Window';
          } else {
            // Check if it's a browser type
            if (GLOBAL_TYPES.includes(type.isInstanceOf)) {
              out += type.isInstanceOf;
            } else {
              // Other wise try to convert as ref
              out += this.convertRef(type.isInstanceOf);
            }
          }
        } else if (type.additionalProperties) {
          // If it has additional, but not normal properties, try converting those properties as a type,
          // passing the parent name
          // bugfix: additionalProperties is sometimes a boolean, so you can't assign .id
          //  and you can't run convertType with additionalProperties as the argument
          if (typeof(type.additionalProperties) === 'object') {
            type.additionalProperties.id = type.id;
            out += `{[key: string]: ${this.convertType(type.additionalProperties)}}`;
          }
          else out += `{[key: string]: ${typeof(type.additionalProperties)}}`;
        } else {
          // Okay so it's just some kind of object, right?...
          out += 'object';
        }
      } else if (type.type === 'array') {
        // It's an array
        // Does it specify a fixed amount of items?
        if (type.minItems && type.maxItems && type.minItems === type.maxItems) {
          // Yes, fixed amount of items, output it as an array literal
          out += `[${new Array(type.minItems).fill(this.convertType(type.items!)).join(', ')}]`;
        } else if (type.items) {
          // Figure out the array type, passing parent name
          type.items.id = type.id;
          let arrayType = this.convertType(type.items) as string;
          // Very bad check to see if it's a "simple" type in array terms
          // This just checks if it's an enum or object, really
          // TODO: Could probably be done better
          if (
            arrayType.includes('\n') ||
            arrayType.includes(';') ||
            arrayType.includes(',') ||
            arrayType.includes('"') ||
            arrayType.includes('|')
          ) {
            // If it's not simple, use the Array<type> syntax
            out += `Array<${arrayType}>`;
          } else {
            // If it is simple use type[] syntax
            out += `${arrayType}[]`;
          }
        }
      } else if (type.type === 'function') {
        // It's a function
        // Convert it as an array function
        out += this.convertFunction(type, true, false);
      } else if (SIMPLE_TYPES.includes(type.type)) {
        // It's a simple primitive
        out += this.convertPrimitive(type.type);
      }
    } else if (type.$ref) {
      // If it's a reference
      out += this.convertRef(type.$ref);
    } else if (type.value) {
      // If it has a fixed value, just set its type as the type of said value
      out += typeof type.value;
    }
    if (out === '') {
      // Output an error if the type couldn't be converted using logic above
      throw new Error(`Cannot handle type ${JSON.stringify(type)}`);
    }
    return out;
  }

  collapseExtendedTypes(types: TypeSchema[]) {
    let collapsedTypes: Indexable<TypeSchema> = {};
    // For each type
    for (let type of types) {
      // Get its id or the id of the type it extends
      let name = type.$extend || (type.id as string);
      // Don't want this key to be merged (as it could cause conflicts if that is even possible)
      delete type.$extend;
      // Have we seen it before?
      if (collapsedTypes.hasOwnProperty(name)) {
        // Merge with the type we already have, concatting any arrays
        _.mergeWith(collapsedTypes[name], type, (objValue, srcValue) => {
          if (_.isArray(objValue)) {
            return objValue.concat(srcValue);
          }
        });
      } else {
        // Okay first time we see it, so for now it's collapsed
        collapsedTypes[name] = type;
      }
    }
    return Object.values(collapsedTypes);
  }

  extendImportedTypes(types: TypeSchema[]) {
    // For each type
    for (let type of types) {
      // If it has an import
      if (type.$import) {
        // Find what we're importing
        const imp = _.find(types, (x: TypeSchema) => {
          // We need the split cause theme.json apparently has a "manifest.ManifestBase"
          // despite being in the manifest namespace already
          const imp = type.$import!.split('.')[0];
          return x.id === imp || x.name == imp;
        });
        // Merge it, preferring type values not imp, and making sure we don't have dupes in arrays
        _.mergeWith(type, imp, (objValue, srcValue, key) => {
          if (_.isArray(objValue)) {
            return _.uniqWith(objValue.concat(srcValue), (arrVal, othVal) => {
              return (
                (arrVal.id !== undefined && arrVal.id === othVal.id) ||
                (arrVal.name !== undefined && arrVal.name === othVal.name)
              );
            });
          }
          if (objValue !== undefined && !_.isObject(objValue)) {
            return objValue;
          }
        });
      }
    }
  }

  convertTypes(types: TypeSchema[] | undefined) {
    if (types === undefined) return [];
    // Collapse types that have an $extend in them
    types = this.collapseExtendedTypes(types);
    // Extend types that have an $import in them
    this.extendImportedTypes(types);
    let convertedTypes = [];
    // For each type
    for (let type of types) {
      // Convert it as a root type
      let convertedType = this.convertType(type, true);
      // If we get nothing in return, ignore it
      if (convertedType === undefined) continue;
      // If we get its id in return, it's being weird and should just not be typechecked
      if (convertedType === type.id) convertedType = 'any';
      // Get the comment
      let comment = commentFromSchema(type);
      // Add converted source with proper keyword in front
      // This is here instead of in convertType, since that is also used for non root purposes
      if (type.functions || type.events || (type.type === 'object' && !type.isInstanceOf)) {
        // If it has functions or events, or is an object that's not an instance of another one, it's an
        // interface
        convertedTypes.push(`${comment}${this.exp}interface ${type.id} ${convertedType}`);
      } else if (type.enum) {
        // As per https://github.com/DefinitelyTyped/DefinitelyTyped/issues/23002 don't use actual
        // typescript enums
        convertedTypes.push(`${comment}${this.exp}type ${pascalCase(type.id!)} = ${convertedType}`);
      } else {
        // It's just a type of some kind
        convertedTypes.push(`${comment}${this.exp}type ${type.id} = ${convertedType};`);
      }
    }
    return convertedTypes;
  }

  convertProperties(properties: Indexable<TypeSchema> | undefined) {
    if (properties === undefined) return [];
    let convertedProperties = [];
    // For each property, just add it as a const, appending | undefined if it's optional
    for (let [propName, prop] of Object.entries(properties)) {
      prop.id = propName;
      convertedProperties.push(
        `${commentFromSchema(prop)}${this.exp}const ${propName}: ${this.convertType(prop)}${
          prop.optional ? ' | undefined' : ''
        };`
      );
    }
    return convertedProperties;
  }

  convertParameters(parameters: TypeSchema[] | undefined, includeName = true, name?: string) {
    if (parameters === undefined) return [];
    let convertedParameters = [];
    // For each parameter
    for (let parameter of parameters) {
      let out = '';
      // If includeName then include the name (add ? if optional)
      if (includeName) out += `${parameter.name || ''}${parameter.optional ? '?' : ''}: `;
      // Convert the paremeter type passing parent id as id
      parameter.id = pascalCase(`${name}_${parameter.name || ''}`);
      out += this.convertType(parameter);
      convertedParameters.push(out);
    }
    return convertedParameters;
  }

  convertSingleFunction(
    name: string,
    returnType: string,
    arrow: boolean,
    classy: boolean,
    func: TypeSchema
  ) {
    let parameters = this.convertParameters(func.parameters, true, func.name);
    // function x() {} or () => {}?
    if (arrow) {
      // Okay () => {}, unless we want it classy (inside a class) in which case use name(): {}
      return `${
        classy ? `${commentFromSchema(func)}${name}${func.optional ? '?' : ''}` : ''
      }(${parameters.join(', ')})${classy ? ':' : ' =>'} ${returnType}`;
    } else {
      // If the name is a reversed keyword
      if (RESERVED.includes(name)) {
        // Add an underscore to the definition and export it as the proper name
        this.additionalTypes.push(`export {_${name} as ${name}};`);
        name = '_' + name;
        return `${commentFromSchema(func)}function ${name}(${parameters.join(', ')}): ${returnType};`;
      }
      // Optional top-level functions aren't supported, because commenting parameters doesn't work for them
      else
        return `${commentFromSchema(func)}${this.exp}function ${name}(${parameters.join(', ')}): ${returnType};`;
    }
  }

  convertFunction(func: TypeSchema, arrow = false, classy = false) {
    let out = '';
    // Assume it returns void until proven otherwise
    let returnType: string | TypeSchema = 'void';
    // Prove otherwise? either a normal returns or as an async promise
    if (func.returns) {
      // First check if it has a callbackc and a return value
      // If it does it's probably cause we overwrote the return value in index.ts and we need to remove the
      // callback parameter anyways
      let callback =
        func.parameters &&
        func.parameters.find((x) => x.type === 'function' && x.name === func.async);
      if (callback) {
        func.parameters = func.parameters!.filter((x) => x !== callback);
      }
      returnType = this.convertType(func.returns);
      if (func.returns.optional && !ALREADY_OPTIONAL_RETURNS.includes(returnType))
        returnType += ' | void';
    } else {
      if (func.async === undefined) func.async = 'callback';
      // If it's async then find the callback function and convert it to a promise
      let callback =
        func.parameters &&
        func.parameters.find((x) => x.type === 'function' && x.name === func.async);
      if (callback) {
        // Remove callback from parameters as we're gonna handle it as a promise return
        func.parameters = func.parameters!.filter((x) => x !== callback);
        let parameters = this.convertParameters(
          callback.parameters,
          false,
          pascalCase(`${func.name}_return`)
        );
        if (parameters.length > 1) {
          // Since these files are originally chrome, some things are a bit weird
          // Callbacks (which is what chrome uses) have no issues with returning multiple values
          // but firefox uses promises, which AFAIK can't handle that
          // This doesn't seem to be a problem yet, as firefox hasn't actually implemented the methods in
          // question yet But since it's in the schemas, it's still a problem for us
          // TODO: Follow firefox developments in this area
          console.warn(`Promises cannot return more than one value: ${func.name}.`);
          // Just assume it's gonna be some kind of object that's returned from the promise
          // This seems like the most likely way the firefox team is going to make the promise return
          // multiple values
          parameters = ['object'];
        }
        // Use void as return type if there were no parameters
        // Note that the join is kinda useless (see long comments above)
        let promiseReturn = parameters[0] || 'void';

        // https://github.com/jsmnbom/definitelytyped-firefox-webext-browser/issues/21
        //if (callback.optional && !ALREADY_OPTIONAL_RETURNS.includes(promiseReturn)) promiseReturn += '|undefined';7
        // https://github.com/jsmnbom/definitelytyped-firefox-webext-browser/issues/35
        if (callback.converterPromiseOptional) promiseReturn += '|undefined';
        if (callback.converterPromiseOptionalNull) promiseReturn += '|null';

        returnType = `Promise<${promiseReturn}>`;
        // Because of namespace extends(?), a few functions can pass through here twice,
        // so override the return type since the callback was removed and it can't be converted again
        func.returns = { converterTypeOverride: returnType };
        // Converted now
        delete func.async;
      } else if (func.async && func.async !== 'callback') {
        // Since it's async it's gotta return a promise... the type just isn't specified in the schemas
        returnType = 'Promise<any>';
      }
    }

    // Create overload signatures for leading optional parameters
    // Typescript can't handle when e.g. parameter 1 is optional, but parameter 2 isn't
    // Therefore output multiple function choices where we one by one, strip the optional status

    // Check if "parameters[index]" is optional with at least one required parameter following it
    let isLeadingOptional = (parameters: TypeSchema[], index: number) => {
      let firstRequiredIndex = parameters.findIndex((x) => !x.optional);
      if (firstRequiredIndex === -1) return parameters.length > 1;
      return firstRequiredIndex > index;
    };

    // Optional parameters with at least one required parameter following them, marked as non-optional
    let leadingOptionals: TypeSchema[] = [];
    // The rest of the parameters
    let rest = [];
    for (let [i, param] of (func.parameters || []).entries()) {
      if (isLeadingOptional(func.parameters!, i)) {
        leadingOptionals.push(param);
      } else {
        rest.push(param);
      }
    }

    // Output the normal signature
    out += this.convertSingleFunction(func.name!, returnType, arrow, classy, {
      ...func,
      parameters: rest,
    });
    // Output signatures for any leading optional parameters
    for (let i = 0; i < leadingOptionals.length; i++) {
      let funcWithParams = {
        ...func,
        // Get the last i items, and make sure that the last item is optional, then concat with rest of params
        parameters: leadingOptionals
          .slice(i)
          .map((param, paramI) => {
            return {
              ...param,
              optional: paramI > i,
            } as TypeSchema;
          })
          .concat(rest),
      };
      out +=
        '\n' +
        this.convertSingleFunction(func.name!, returnType, arrow, classy, funcWithParams) +
        (classy && i !== leadingOptionals.length - 1 ? ';\n' : '');
    }

    return out;
  }

  convertFunctions(functions: TypeSchema[] | undefined) {
    if (functions === undefined) return [];
    let convertedFunctions = [];
    for (let func of functions) {
      convertedFunctions.push(this.convertFunction(func, false, false));
    }
    return convertedFunctions;
  }

  // noinspection JSMethodCanBeStatic
  convertSingleEvent(
    parameters: string[],
    returnType: string,
    extra: string[] | undefined,
    name: string
  ) {
    if (extra) {
      // It has extra parameters, so output custom event handler
      let listenerName = '_' + pascalCase(`${this.namespace}_${name}_Event`)
          .replace('.', '_');  // For stuff from nested namespaces
      this.additionalTypes.push(`${this.exp}interface ${listenerName}<TCallback = (${parameters.join(
        ', '
      )}) => ${returnType}> {
    addListener(cb: TCallback, ${extra.join(', ')}): void;
    removeListener(cb: TCallback): void;
    hasListener(cb: TCallback): boolean;
}`);
      //this.additionalTypes.push(`type ${listenerName}<T =`);
      return `${listenerName}`;
    } else {
      // It has no extra parameters, so just use the helper that we define in HEADER
      return `WebExtEvent<(${parameters.join(', ')}) => ${returnType}>`;
    }
  }

  convertEvent(event: TypeSchema, classy = false) {
    let out = '';
    // Assume it returns void until proven otherwise
    let returnType = 'void';
    // Prove otherwise?
    if (event.returns) {
      returnType = this.convertType(event.returns);
      if (event.returns.optional && !ALREADY_OPTIONAL_RETURNS.includes(returnType))
        returnType += ' | void';
    }

    // Check if we have extra parameters (for the addListener() call)
    let extra;
    if (event.extraParameters) {
      // If we do, get them
      extra = this.convertParameters(event.extraParameters, true, event.name);
    }

    // Get parameters
    let parameters = this.convertParameters(event.parameters, true, event.name);
    // Typescript can't handle when e.g. parameter 1 is optional, but parameter 2 isn't
    // Therefore output multiple event choices where we one by one, strip the optional status
    // So we get an event that's '(one, two) | (two)' instead of '(one?, two)'
    for (let i = 0; i < parameters.length; i++) {
      if (parameters[i].endsWith('?') && parameters.length > i + 1) {
        out +=
          '\n| ' + this.convertSingleEvent(parameters.slice(i + 1), returnType, extra, event.name!);
      } else {
        break;
      }
    }
    parameters = parameters.map((x, i) => {
      if (parameters.length > 0 && i < parameters.length - 1) {
        // Remove the optional ?
        // Do not remove a ? if it's part of an object definition (which spans multiple lines)
        return x.replace(/\?(?![\s\S]*\n)/, '');
      }
      return x;
    });

    // Add const and ; if we're not in a class
    out = `${!classy ? `${this.exp}const ` : ''}${event.name}: ${this.convertSingleEvent(
      parameters,
      returnType,
      extra,
      event.name!
    )}${out}${!classy && event.optional ? ' | undefined' : ''}${!classy ? ';' : ''}`;

    // Comment it
    out = commentFromSchema(event) + out;

    return out;
  }

  convertEvents(events: TypeSchema[] | undefined) {
    if (events === undefined) return [];
    let convertedEvents = [];
    for (let event of events) {
      convertedEvents.push(this.convertEvent(event, false));
    }
    return convertedEvents;
  }

  convertNamespace() {
    // Get data for this namespace
    let data = this.namespaces[this.namespace];
    let out = '';

    if (data.$import) {
      let skipKeys = [
        'namespace',
        'description',
        'permissions',
        'max_manifest_version',
        'min_manifest_version',
      ];
      _.mergeWith(data, this.namespaces[data.$import], (objValue, srcValue, key) => {
        if (skipKeys.includes(key)) return objValue === undefined ? null : objValue;
        if (_.isArray(objValue)) {
          return _.uniqWith(objValue.concat(srcValue), (arrVal, othVal) => {
            return (
              (arrVal.id !== undefined && arrVal.id === othVal.id) ||
              (arrVal.name !== undefined && arrVal.name === othVal.name)
            );
          });
        }
      });
    }

    // Clear additional types
    this.additionalTypes = [];
    // Convert everything
    this.types = this.convertTypes(data.types);
    this.properties = this.convertProperties(data.properties);
    this.functions = this.convertFunctions(data.functions);
    this.events = this.convertEvents(data.events);

    // Make sure there are no duplicates
    this.additionalTypes = _.uniqWith(this.additionalTypes, _.isEqual);

    // Output everything if needed

    // Comment the description and permissions/manifest keys
    let doclines = [];
    if (data.description) {
      doclines.push(descToMarkdown(data.description));
    }
    if (data.permissions && data.permissions.length > 0) {
      // Manifest keys are in the permissions array, but start with "manifest:"
      let permissions = [];
      let manifestKeys = [];
      for (let perm of data.permissions) {
        if (/^manifest:(.*)/.exec(perm)) {
          manifestKeys.push(RegExp.$1);
        } else {
          permissions.push(perm);
        }
      }
      if (permissions.length > 0) {
        doclines.push(`Permissions: ${permissions.map((p) => `\`${p}\``).join(', ')}`);
      }
      if (manifestKeys.length > 0) {
        doclines.push(`Manifest keys: ${manifestKeys.map((p) => `\`${p}\``).join(', ')}`);
      }
    }
    // Manifest version
    if (data.min_manifest_version) {
      doclines.push(`Needs at least manifest version ${data.min_manifest_version}.`);
    }
    if (data.max_manifest_version) {
      doclines.push(`Not supported on manifest versions above ${data.max_manifest_version}.`);
    }

    // Allowed contexts
    let contexts = formatContexts(data.allowedContexts, true);
    if (contexts) {
      doclines.push(contexts);
    }

    // See also links (Thunderbird)
    if (data.docURL) {
      doclines.push(`@see ${data.docURL}`);
    }

    // Turn it into JSDoc comment form
    if (doclines.length > 0) {
      out += toDocComment(doclines.join('\n\n')) + '\n';
    }

    // Nested namespace declarations, so each declaration only uses the 'leaf' of the namespace:
    // if this is namespace browser.browserSettings.colorManagement, we are already two levels deep
    // and we  [export] namespace colorManagement  here.
    const namespace_name_leaf: string = data.namespace.replace(/^.+\./, '');
    // Thunderbird on WebStorm: declare each namespace as a constant, so it has
    // documentation in its tooltip (seems to be a WebStorm bug, not needed elsewhere)
    if (this.webstorm) {
      out += `const ${namespace_name_leaf};\n`
    }
    out += `${this.exp}namespace ${namespace_name_leaf} {\n`;
    if (this.types.length > 0)
      out += `/* ${data.namespace} types */\n${this.types.join('\n\n')}\n\n`;
    if (this.additionalTypes.length > 0) out += `${this.additionalTypes.join('\n\n')}\n\n`;
    if (this.properties.length > 0)
      out += `/* ${data.namespace} properties */\n${this.properties.join('\n\n')}\n\n`;
    if (this.functions.length > 0)
      out += `/* ${data.namespace} functions */\n${this.functions.join('\n\n')}\n\n`;
    if (this.events.length > 0)
      out += `/* ${data.namespace} events */\n${this.events.join('\n\n')}\n\n`;
    // Thunderbird: nest the nested namespaces (like addressBooks.provider) in the output
    for (let child_namespace of Object.keys(this.namespaces).
      filter(ns => ns.match(new RegExp('^' + data.namespace + '\\.[^.]+$')))) {
      this.out += out;
      out = '\n';
      this.namespace = child_namespace;
      this.convertNamespace();
    }

    out = out.slice(0, out.length - 1) + '}\n\n';
    this.out += out;
  }

  write(filename: string) {
    try {
      const output: string = format(this.out, {
        parser: "typescript",
        useTabs: true,
        singleQuote: true,
        bracketSpacing: false,
        printWidth: 100,
      });
      Writer({path: filename}).write(output);
    } catch(err) {
      console.debug('[The library \'prettier\' encountered formatting errors]');
      console.debug(err.toString());
      Writer({path: filename}).write(this.out);
    }
  }

  removeNamespace(name: string) {
    delete this.namespaces[name];
  }

  getIdOrName(type: TypeSchema) {
    return type['id'] || type['name'] || type['$extend'] || type['$import'];
  }

  getIndex(namespace: string, section: string, id_or_name: string): number {
    return (this.namespaces[namespace] as any)[section].findIndex((x: TypeSchema) => {
      return this.getIdOrName(x) === id_or_name;
    });
  }

  remove(namespace: string, section: string, id_or_name: string) {
    // prevent Firefox overrides from failing on Thunderbird API
    if (!this.namespaces[namespace] || !(this.namespaces[namespace] as any)[section])
      return console.debug(`[skipping ${namespace}.${section}.${id_or_name}]`);
    const index = this.getIndex(namespace, section, id_or_name);
    if (index === -1) {
      console.warn('Missing thing to remove', namespace, section, id_or_name);
      return 
    }
    (this.namespaces[namespace] as any)[section].splice(index, 1);
  }

  edit(
    namespace: string,
    section: string,
    id_or_name: string,
    edit: (type: TypeSchema) => TypeSchema
  ) {
    // prevent Firefox overrides from failing on Thunderbird API
    if (!this.namespaces[namespace] || !(this.namespaces[namespace] as any)[section])
      return console.debug(`[skipping ${namespace}.${section}.${id_or_name}]`);
    console.log(`Editing ${namespace}.${section}.${id_or_name}`);
    const index = this.getIndex(namespace, section, id_or_name);
    if (index === -1) {
      console.warn('Missing thing to edit', namespace, section, id_or_name);
      return 
    }
    const sectionObj = (this.namespaces[namespace] as any)[section];
    if (sectionObj[index] === undefined || sectionObj[index] === null) {
      console.warn('WARNING: Is either undefined or null!');
    }
    sectionObj[index] = edit(sectionObj[index]);
  }

  add(namespace: string, section: string, value: TypeSchema) {
    // prevent Firefox overrides from failing on Thunderbird API
    if (!this.namespaces[namespace] || !(this.namespaces[namespace] as any)[section])
      return console.debug(`[skipping ${namespace}.${section}]`);
    console.log(`Adding to ${namespace}.${section}.${this.getIdOrName(value)}`);
    const sectionObj = (this.namespaces[namespace] as any)[section];
    sectionObj.push(value);
  }

  edit_path(path: [string, string, string] | string[], edit: (x: any) => any) {
    this.edit(path[0], path[1], path[2], edit);
  }
}
