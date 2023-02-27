# DefinitelyTyped Thunderbird WebExt Browser

Script to generate type definitions and documentation for the development of WebExtension add-ons for Mozilla Thunderbird. The generated files can be used in [IDE](## "integrated development environment")s like VS Code and WebStorm.

This generator is derived from [definitelytyped-firefox-webext-browser](https://github.com/jsmnbom/definitelytyped-firefox-webext-browser), a generator for the type definitions for development of Firefox add-ons, made by [Jasmin Bom](https://github.com/jsmnbom).

## Usage
*You should only need to do this if you wanna update the definitions; to just use them, download the resulting definition file.*

### 1. Clone, install, and compile to JavaScript
On a machine that has node.js and npm, download the project files. For example,

```shell
$ git clone https://github.com/JimDanner/definitelytyped-thunderbird-webext-browser.git
```

In the cloned folder, install the project dependencies:

```shell
$ npm install
```

Compile the TypeScript programs to JavaScript:

```shell
$ npm run once
```

### 2. Download type info and documentation
The generator uses type information and documentation contained in JSON files from the source code of Thunderbird and its rendering engine Gecko. The `download.js` script can do most of the work, you only need to choose a Thunderbird version whose WebExtension API you want to use for writing add-ons.

Go to [the source code site](https://hg.mozilla.org/try-comm-central/tags) and copy the *tag* of the version you choose – this would be `THUNDERBIRD_102_7_2_RELEASE` if you plan to develop add-ons for Thunderbird 102.7.2.

#### Notice: one part of this generator is version-dependent

The script [src/overrides.ts](https://github.com/JimDanner/definitelytyped-thunderbird-webext-browser/blob/master/src/overrides.ts) corrects shortcomings of the downloaded JSON files – they have some duplication, they don't always show the correct return type for functions, and they list some mandatory function parameters as optional. Thus, **whenever the APIs change, overrides.ts must also be updated**. The current file was updated for

https://github.com/JimDanner/definitelytyped-thunderbird-webext-browser/blob/master/src/overrides.ts#L1

If that differs a lot from the version you're generating for, there may be imperfections in the result.

Next, tell the program to start downloading:

```shell
$ node build/download.js --tag <TAG>
```

for example,
```shell
$ node build/download.js --tag THUNDERBIRD_102_7_2_RELEASE
```

It will download several files:

* JSON files from the Thunderbird source code, containing definitions and documentation for Thunderbird-specific APIs like `addressBooks` (the ones that Firefox doesn't have).
* Additional meta-information that is in Thunderbird's source code, like the version number (in this example: 102.7.2) and the version tag of its Gecko renderer (in this example: `FIREFOX_102_7_0esr_BUILD1`)
* The list of APIs that this Thunderbird version inherits from Gecko/Firefox, which is in a table on a webpage at [thunderbird.net](https://webextension-api.thunderbird.net/en/102/#firefox-webextension-apis-supported-by-thunderbird).
* JSON files from the Firefox source code, containing definitions and documentation for the Firefox/Gecko APIs that Thunderbird uses.

### 3. Generate the definition file
If everything has downloaded successfully, the program can generate the type definitions and documentation:

```shell
$ node build/index.js --tag <TAG> --out <OUTPUT_FILE>
```

for example,

```shell
$ node build/index.js --tag THUNDERBIRD_102_7_2_RELEASE --out index.d.ts
```

Both options may be omitted:

* without `--out` the output file will be `index.d.ts`
* without `--tag` the program takes the first version whose downloads it finds in the current directory – so if you have downloaded more than one version, be sure to include the tag.

### 4. Use the definitions, or submit them to DefinitelyTyped
How you install the definition file `index.d.ts` in your IDE depends on the IDE. For example, in WebStorm you go to the settings, Languages & Frameworks, JavaScript, Libraries, click on Add... and choose the framework type *Custom*, click the + icon and attach the file.

When the `@types` repository, also known as [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped), has accepted the thunderbird-webext-browser package (no-one has submitted it to them so far), IDEs can install it from that repository as `@types/thunderbird-webext-browser`.

The repository will then accept updates in the form of pull requests. For sending PRs to DefinitelyTyped you need to include why you changed. For simple updates (Thunderbird version changes), this can be easily generated and uploaded to gist using the included script (requires the gist tool and that you are logged in):

```shell
diffgen THUNDERBIRD_91_8_0_RELEASE THUNDERBIRD_102_7_2_RELEASE
```
