# DefinitelyTyped Thunderbird WebExt Browser

Script to generate type definitions and documentation for the development of WebExtension add-ons for Mozilla Thunderbird. The generated files can be used in [IDE](## "integrated development environment")s like VS Code and WebStorm. They are available for installation as `@types/thunderbird-webext-browser`.

This generator is derived from [definitelytyped-firefox-webext-browser](https://github.com/jsmnbom/definitelytyped-firefox-webext-browser), a generator for the type definitions for development of Firefox add-ons, made by [Jasmin Bom](https://github.com/jsmnbom).

## Usage
*You should only need to do this if you want to update the definitions; to just use them, download the resulting definition file from the OUTPUT directory (see [below](#4-use-the-definitions-or-submit-them-to-definitelytyped) for usage) or install the definition package `@types/thunderbird-webext-browser` in the manner provided by your development environment.*

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

Go to [the source code site](https://hg.mozilla.org/try-comm-central/tags) and copy the *tag* of the version you choose – this would be `THUNDERBIRD_102_7_2_RELEASE` if you plan to develop add-ons for Thunderbird 102.7.2, or `default` to get the latest version that's under development.

<details>
<summary><b>Notice: one part of this generator is version-dependent</b> (click arrow for details)</summary>

The scripts `src/overrides.ts` and `tb-overrides.ts` correct shortcomings of the downloaded JSON files – they have some duplication, they don't always show the correct return type for functions, and they list some mandatory function parameters as optional. Thus, **whenever the APIs change, the overrides scripts must also be updated**. The current files were updated for version THUNDERBIRD_126_0b1_RELEASE (see [the source code](https://github.com/JimDanner/definitelytyped-thunderbird-webext-browser/blob/master/src/overrides.ts#L1) to verify the current version).

If that differs a lot from the version you're generating for, there may be imperfections in the result.
</details>

Next, tell the program to start downloading:

```shell
$ node build/download.js --tag <TAG>
```

for example,
```shell
$ node build/download.js --tag THUNDERBIRD_102_7_2_RELEASE
```

You can also use `-t` instead of `--tag`. It will download several files:

* JSON files from the Thunderbird source code, containing definitions and documentation for Thunderbird-specific APIs like `addressBooks` (the ones that Firefox doesn't have).
* Additional meta-information that is in Thunderbird's source code, like the version number (in this example: 102.7.2) and the version tag of its Gecko renderer (in this example: `FIREFOX_102_7_0esr_BUILD1`)
* The list of APIs that this Thunderbird version inherits from Gecko/Firefox, which is in a table on a webpage at [thunderbird.net](https://webextension-api.thunderbird.net/en/102/#firefox-webextension-apis-supported-by-thunderbird). ***Note:*** if anyone knows of a systematic way to get this list from the Thunderbird source code, let me know!
* JSON files from the Firefox source code, containing definitions and documentation for the Firefox/Gecko APIs that Thunderbird uses.

### 3. Generate the definition file
If everything has downloaded successfully, the program can generate the type definitions and documentation:

```shell
$ node build/index.js [--tag <TAG>] [--out <OUTPUT_FILE>] [--webstorm]
```

for example,

```shell
$ node build/index.js --tag THUNDERBIRD_102_7_2_RELEASE --out v102/index.d.ts
```

All options may be omitted:

* without `--out` (or `-o`) the output will be a file named `index.d.ts` in a subdrectory of `OUTPUT/`
* without `--tag` (or `-t`) the program takes the first version whose downloads it finds – so if you have downloaded the files for more than one version, be sure to include the tag
* with `--webstorm` (or `-w`) the program generates a special version that works better in the WebStorm IDE. The standard version works better in Visual Studio Code.

### 4. Use the definitions, or submit them to DefinitelyTyped
How you install the definition file `index.d.ts` in your IDE depends on the IDE. For example:

* in WebStorm you go to the settings, Languages & Frameworks, JavaScript, Libraries, click on Add... and choose the framework type *Custom*, click the + icon and attach the file.
* in Visual Studio Code, you add the `index.d.ts` file in the root of your project, and also put a file named `jsconfig.json` there (you can leave that file empty).

The definitions [are also in](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/thunderbird-webext-browser) the `@types` repository, also known as [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped), so a development environment can install it from that repository as `@types/thunderbird-webext-browser`.

<details><summary><b>Submitting updates to DefinitelyTyped</b> (click the arrow for details)</summary>
The DefinitelyTyped repository will accept updates in the form of pull requests. For sending PRs to DefinitelyTyped you need to include why you changed. For simple updates (Thunderbird version changes), this can be easily generated and uploaded to gist using the included script (requires the gist tool and that you are logged in):

```shell
diffgen THUNDERBIRD_91_8_0_RELEASE THUNDERBIRD_102_7_2_RELEASE
```

</details>

## Technical notes
There are several differences between this generator and [the one for Firefox WebExtensions declaration files](https://github.com/jsmnbom/definitelytyped-firefox-webext-browser) on which it is based. That was necessary because the Thunderbird JSON schemas are distributed between Thunderbird and Firefox source code; the Thunderbird schemas have some quirks that those for Firefox don't have; and the API has items like `browser.messages.delete()` whose names are reserved words in JavaScript, leading to tough problems with the TypeScript language (basically a form of JavaScript) in which the declarations are written.

I have documented a few of these difficulties in the `doc` directory:

* [Reserved words](./doc/Reserved%20words.md): issues related to the use of `delete` and `import` as names in the Thunderbird API;
* [Type files](./doc/Type%20files.md): how to organize the various namespaces in the declaration file;
* [Converter](./doc/Converter.md): some things I came across in the `converter.ts` script.

Some implementation notes are in comments in the scripts themselves, notably an explanation of the algorithm that creates function overloads when the API has optional function parameters in certain places: in the file `converter.ts`, in the function `convertFunction`.
