# Notes converter.js

## Types/interfaces defined in converter.d.js
`TypeSchema` holds full details of a type, whether it's a function type, a class, or a simpler thing. Including the function parameters (themselves again of type `TypeSchema`), properties (idem), deprecation, references etc.

`NamespaceSchema` holds all data of a namespace: name, description, the types it has (array of `TypeSchema` objects), functions it has (idem), events (idem), permissions required, etc.

## Members of Converter object
`this.schemaData` array of two-member arrays of the JSON files, each of form `[filepath, object]` with the object being the full thing read from the file. Automatically made at start from *all* files in the folders given to the constructor.

JSON files have the structure: array of objects, where there's one object per namespace affected by that JSON file.
The object's `.namespace` property is the string describing the namespace, such as `browserAction`.

`this.namespaces` object of the form

```json
{
  namespacestring: NamespaceSchema,
  ...
}
```

where the property name is the namespace name, and the value is a `NamespaceSchema` object that will be derived from the JSON files, like the types, functions, events etc. related to that namespace.

Automatically filled by the constructor with *everything* in all of the JSON files. **Strange**: it fills the `.description` property only at the _first_ occasion it encounters the namespace in the files. But what if that's not the namespace's introduction?
**See if it changes anything** of you do it differently.
Also, the NamespaceSchema object is filled with *all* types, functions and so on that are found for that namespace in any JSON files.

For all the types, the constructor sets the `.optional` flag equal to `.unsupported` (as taken from the 
 JSON-files) when we call 

```ts
converter.setUnsupportedAsOptional();
```

in index.ts.

## Override
After the constructor, the override function runs on the converter.
It calls the methods of Converter:

* `edit(namespace, section, id/name, editfunction)`
* `edit_path` (a wrapper around `edit`)
* `remove`
* `add`
* `removeNamespace` for the `test` namespace, which is OK of course

Inserted a check in `edit`, `remove` and `add` to avoid crashes from trying to change non-existing properties (commit 383dbf6967). 

### Optional promises
The converter changes callbacks in the schemas to promises, because the schemas are derived from Chrome's WebExtensions API which uses callbacks, but Firefox and Thunderbird implement them with promises. Some callbacks in the schemas have 'optional' arguments. To be clear: not only the callback is optional (as it usually is, meaning the user is not obliged to 'consume' the promise), but so is _the callback's argument_. This means Thunderbird may choose not to return a value; the promise may resolve to `undefined` or `null`.

But in fact, [this is often untrue](https://github.com/jsmnbom/definitelytyped-firefox-webext-browser/issues/21) according to MDN and Thunderbird API documentation. If we trust the 'optional' flag in the schema, we get it wrong more often than right. 

So I've gone to the trouble of looking it up in the online documentation for all twenty-or-so individual cases (*sigh...*). For those cases where a nullish value is really allowed, the override scripts [overrides.ts](..%2Fsrc%2Foverrides.ts) and [tb-overrides.ts](..%2Fsrc%2Ftb-overrides.ts) add a flag 'by hand' that tells the converter to insert the alternative possibility, making the return value something like

```ts
Promise<MailAccount|null>
```

Here's the list of functions whose callbacks have an optional parameter according to the schemas:

**Thunderbird API**
* actually may return `null`:
  * `accounts.get`
  * `accounts.getDefault`
  * `identities.get`
* actually may return `undefined`:
  * `mailTabs.getCurrent`
  * `tabs.getCurrent`
* listed as optional but the documentation says nothing about that:
  * `contacts.getPhoto`
  * `tabs.create`, `.duplicate`, `.update`, `.executeScript`
  * `windows.create`

**Firefox API** (the parts used in Thunderbird)
* actually may return `null`:
  * `cookies.get` and `.remove`
  * `runtime.getBackgroundPage` (to be added by the Firefox types maintainer)
* actually may return `undefined`:
  * `alarms.get`
* listed as optional but the documentation says nothing about that:
  * `cookies.set`
  * `downloads.getFileIcon`
  * `identity.launchWebAuthFlow`
  * `webNavigation.getFrame` and `.getAllFrames`

**Firefox API** (the parts _not_ used in Thunderbird)
* listed as optional but the documentation says nothing about that:
  * `devtools.inspectedWindow.eval`
  * `tabs.create`, `.duplicate`, `.update`, `.executeScript`, `.getCurrent`
  * `windows.create`

## Convert
After override, the `.convert()` method runs on the object.

It iterates through the namespaces, and for each one:

* sets `this.namespace` to its string name
* calls `convertNamespace()` which then picks up the string from the `this` object
* That function then puts the relevant namespace object in `data`
* It then assigns some (intermediate?) results to `this`-properties by calling all those functions `convertTypes`, etc.
* `convertTypes` calls `convertType`, where all the errors seem to happen.

Errors so far:

>type.additionalProperties.id = type.id;
>TypeError: Cannot create property 'id' on boolean 'true'

And after preventing `.id` to be changed on a Boolean

> throw new Error(`Cannot handle type ${JSON.stringify(type)}`);
>Error: Cannot handle type true

And after the convert method to be called on a boolean property `additionalProperties`:

>throw new Error(`Cannot handle type ${JSON.stringify(type)}`);
>Error: Cannot handle type {"optional":true,"description":"A format options object as used by |DateTimeFormat|. Defaults to: <literalinclude>includes/cloudFile/defaultDateFormat.js<lang>JavaScript</lang></literalinclude>","type":"object","additionalProperties":true,"id":"CloudFileTemplateInfo_download_expiry_date_format"}

This is happening when it tries to 'handle' the **types[1].properties.download_expiry_date.properties.format** 'type' from the namespace cloudFile. 

*Fixed this in commit 383dbf6*.

You can test how it goes by mousing over `format:` in

```js
messenger.cloudFile.onFileUpload.addListener(function(a, f, t, r) {
	return {
		aborted: true;
		templateInfo: {download_expiry_date: {format: }}
	}
})
```

### Desc-to-doc
The descriptions are converted by the `descToMarkdown` and `toMarkdown` functions, but for Thunderbird descriptions some go wrong. The Thunderbird docs are apparently written originally in [reStructuredText](https://docutils.sourceforge.io/docs/user/rst/quickref.html), a vaguely Markdown-like documentation system connected with Python.

This means that the following constructs occur in the Thunderbird JSON schemas:

1. Seems that some literal strings are between `<value>` and `</value>`. But in WebStorm that doesn't get rendered correctly (whereas \`\` does work, and so does `<code>` and `</code>`). Perhaps use single \` and \`?
2. References to other documentation sometimes come as 
    ```
    :ref:`accounts.get`
    ```
    which doesn't render as a link in WebStorm, whereas `{@link accounts.get}` renders correctly; hyperlinks can't do this.
3. Double newlines `\n\n` are deleted, but they actually help format the output, they should be left in
4. A `<literalinclude>` element (comes from the documentation website, where a code example is included) should basically go, or become a link to something. Can we make it a weblink to https://raw.githubusercontent.com/thundernest/webext-docs/latest-mv2/includes/addressBooks/onSearchRequest.js (so we take the content of the tag and prepend https://raw.githubusercontent.com/thundernest/webext-docs/latest-mv2/)? Weblinks work in the Markdown, HTML and {@link } forms.
5. Some links in the JSON files are not functional: the file can have
    ```js
    `legacy properties <|link-legacy-properties|>`__
    ```
    which means nothing (the original link is on the website and its underlying Github repo). This should be replaced by just text. 
6. The program changes
    ```js
    The `theme_experiment add-on in our example repository <https://github.com/thundernest/sample-extensions/tree/master/theme_experiment>`__ is using the
    ```
    to
    ```js
    The `theme_experiment add-on in our example repository <https: github.com="" thundernest="" sample-extensions="" tree="" master="" theme_experiment="">`__ is using
    ```
    and it shouldn't do that; make it a normal link. 
7. Some things are between | and | and they seem to be links to other API objects; replace with `{@link }`
8. *Markdown lists*: One description is as follows:
    ```
    "A <em>dictionary object</em> defining one or more commands as <em>name-value</em>
    pairs, the <em>name</em> being the name of the command and the <em>value</em>
    being a :ref:`commands.CommandsShortcut`. The <em>name</em> may also be one of
    the following built-in special shortcuts: \n * <value>_execute_browser_action</value>
    \n * <value>_execute_compose_action</value> \n *
    <value>_execute_message_display_action</value>\nExample: 
    <literalinclude>includes/commands/manifest.
    json<lang>JSON</lang></literalinclude>"
    ```
    so we should recognize the Markdown list, append extra * signs before those lines (as part of the JSDoc comment), leave a blank line after the list (in addition to all the other replacements); and then it really looks like a bullet list in WebStorm. (Elsewhere the JSON uses the HTML `<li>` element, which works out of the box.)
9. Documentation links: :doc: plus a term, where you must link to the TB documentation followed by the term + `.html`




## Write
After `.convert()`, the `.write(outfile)` method runs.
