# TypeScript Declaration files
A *TypeScript Declaration file* is a file with extension `.d.ts` that contains *ambient declarations* for use in TypeScript programs. The compiler, and the IDE used in writing the TypeScript program, use the declaration file to check the code for correctly-typed use of functions and other items.

## Ambient declarations
An *ambient declaration* is a declaration that doesn't create an object. It has no initialization (for variables) or implementation (for classes and functions) at its location. The ambient declarations notify the TypeScript compiler that things exist that aren't defined (implemented) here – like forward declarations in C programs. They help a TypeScript program use external items, such as API functions or things from an imported JavaScript module.

An ambient declaration is made with the `declare` keyword, which tells the compiler not to expect an implementation in what follows:

```ts
declare function listAccounts(withFolders?: boolean): Promise<Account[]>;
declare class Account {
	id: number;
	name: string;
}
```

It can't have an initializer:

```ts
declare var x: number = 99;  // error.
```

Ambient function declarations can't have default parameter values or function bodies.

For interfaces and type aliases, a normal declaration works just as well as an ambient one, since there's no initialization or implementation anyway. Ambient declarations are useful for declarations that would otherwise create an object: variables, functions, classes, enums and (some) namespaces.

The `declare` keyword works on the entire object to which it's applied: declarations nested inside are understood to be ambient too. So the keyword should not be nested – the following is wrong:

```ts
declare namespace x {
	declare namespace y {  // error
		declare class z {...}
	}
}
```

and the correct version is:

```ts
declare namespace x {
	namespace y {
		class z {...}
	}
}
```

In other words, we declare that the item exists ambiently (in an API or external module) with everything in it, so all those components are also external/ambient.

The things inside an ambient namespace declaration are automatically taken to be exported: it makes no difference whether an item is preceded by the `export` keyword, which is completely optional (from the 2016 draft TypeScript "specification", section 12.1.5).

This is one of the parts of the TypeScript language that have no meaning in JavaScript; thus, compilation of an ambient declaration generates no JavaScript code.

## Declaration (.d.ts) files
In some circumstances, it is useful to put a collection of type, interface and other declarations in a *TypeScript declaration file* with the extension `.d.ts`. Such a file can contain [*ambient declarations*](#Ambient-declarations): function, variable, class and namespace declarations without an initialization or implementation. That allows the file to declare items whose implementation is elsewhere: in an API or a non-TypeScript module.

Some uses of TypeScript declaration files are:

* To keep the declarations of your project neatly together and make them available to code in all TypeScript files in the project. IDEs and TypeScript compilers allow use everywhere, if the directory that holds the `d.ts` files is listed in `tsconfig.json` in the key `compilerOptions.typeRoots: string[]`.
* As an interface that enables *the use of an API or a JavaScript module by a TypeScript program*. The `.d.ts` file gives type annotations for the items from the API or module, so they can be used by code written in TypeScript. It has a similar function as a `.h` header file that tells the C compiler how the code can call functions of some pre-compiled library. For example,
    * a Node.js **module** from npm, built and running in JavaScript, can have an `index.d.ts` file shipped with it, so it can be used by TypeScript code with the `import` directive. The file gets placed in `node_modules/@types/modulename` which has the same submodule structure as the module itself – e.g. in addition to `node_modules/lodash/add.js` there is `node_modules/@types/lodash/add.d.ts`. The former creates a function `add` and the latter has type data for it. `@types/` plays the role that `include/` plays in the C toolchain.
    * an **API** can be documented for use in TypeScript by an `index.d.ts` file. For example, the Firefox WebExtensions API is associated with such a file hosted on [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped), a repository for such files.

  The `.d.ts` file is used by the compiler to check for correct use of the API or module, and by IDEs to provide documentation and auto-completion to the programmer.

TypeScript by default includes a file `lib.d.ts` that provides interface declarations for the built-in JavaScript library as well as the Document Object Model.

### Limitations of TypeScript for WebExtensions
Perfect correspondence between WebExtension definitions and TypeScript declarations seems impossible. For a function with _an optional parameter before the final one_, WebExtensions allows omission of only that optional parameter, and TypeScript doesn't. For example with [tabs.setZoomSettings](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/setZoomSettings):

```ts
browser.tabs.setZoomSettings(tabId?: number, zoomSettings: ZoomSettings): Promise<void>
```

This is not allowed in TypeScript, and the declaration files solve it by overloading the declaration:

```ts
function setZoomSettings(tabId: number, zoomSettings: ZoomSettings): Promise<void>;
function setZoomSettings(zoomSettings: ZoomSettings): Promise<void>;
```

However, that makes the linter `dtslint` unhappy when _the two parameters are of the same type_. For the function [tabs.setZoom](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/setZoom) that has signature

```ts
browser.tabs.setZoom(tabId?: number, zoomFactor: number): Promise<void>
```

the overload

```ts
function setZoom(tabId: number, zoomFactor: number): Promise<void>;
function setZoom(zoomFactor: number): Promise<void>;
```

gives a linting error

> ERROR: 3221:37  unified-signatures  These overloads can be combined into one signature with an optional parameter.

Combining them into a single signature (with the first parameter required and the second optional) would not be useful for the purposes of a `.d.ts` file, such as helpful argument naming and mouse-over documentation. It seems the "TypeScript declaration file" syntax is out of its depth here.

## Publishing to DefinitelyTyped
The repository on Github, which has 8,600 type declaration packages and auto-publishes them to npm, gives incomplete instructions about the submission of a new package. It turns out that you must first *fork* the repository (28,800 developers have done this), or *update* your fork if you already had it (log in and click *sync fork*), and then *clone* the essential parts of your fork to a machine with Node.js and npm:

```shell
git clone --sparse --depth=1 <url>
```

where `--sparse` makes it take only the files in the root directory, and `--depth=1` makes it take only the latest commit (`HEAD`). Then we pull a particular project to our machine:

```shell
git sparse-checkout add types/thunderbird-webext-browser
```

A trend among Node.js users is the abandonment of `npm` for other package managers; DefinitelyTyped works with `pnpm`. It claims to save disk space by avoiding duplication with symlinks and hardlinks into a central on-disk repository. We need to activate that first with `corepack enable` and can then install npm packages our package needs:

```sh
pnpm install -w --filter "{./types/thunderbird-webext-browser}"
```

In the DefinitelyTyped folder, edit `.git/config` to insert the right user data. If we are creating a new declaration package, `mkdir types` and then follow the instructions from the readme section [Create a new package](https://github.com/DefinitelyTyped/DefinitelyTyped#create-a-new-package):

```shell
npx dts-gen --dt --name thunderbird-webext-browser --template module
```

which freezes after warning that this package is not in the npm repository. We kill the process, which has already done its work.

Now put in our own `index.d.ts`.

### Tests
Next, we configure the testing process:

* In `tsonfig.json` we add to `compilerOptions.lib` an item `"dom"` so classes like `Event` don't give errors.
* In `tslint.json` we add a key `rules` with the property `"strict-export-declare-modifiers"` set to the value `false`.

We start writing tests according to the [instructions](https://github.com/Microsoft/DefinitelyTyped-tools/tree/master/packages/dtslint#write-tests). Basics:

* To assert that an expression is of a given type, use `$ExpectType` in a comment above or on the line of the function call or other statement, like `// $ExpectType Promise<number>`
* To assert that an expression causes a compile error, use `// @ts-expect-error`
* The TypeScript version to test against is in `index.d.ts` in a comment on line 5 – but we have been assured that this rule isn't valid anymore and *that comment should be omitted*.

The tester `dtslint` doesn't actually try to *run* the expressions in the testing script (how could it?) but ascertains whether they'd throw a type-related error and, if not, to what type they would evaluate.

To run the tests,

```shell
pnpm test thunderbird-webext-browser
```

which runs Microsoft's `@definitelytyped/dtslint` tester for `.d.ts` files (which apparently employs `eslint` in turn). If a certain test indicates errors you can't solve and don't care about, add this comment above the offending code:

```ts
// tslint:disable:strict-export-declare-modifiers
```

or, for the new `eslint` linter,

```ts
// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
```

If it happens on many lines, you can add the test name (like `strict-export-declare-modifiers`) to `.eslintrc.json` as a property of `rules` and with the value `false`. In principle, DefinitelyTyped is opposed to this, but they did accept it in the end.

After getting the tests right, you must first do a commit and then run `npm run test-all` which gives the result

> 1> thunderbird-webext-browser OK

with no suggestions for improvement.

### Pull request
After updating the version number in `package.json`, committing, and pushing the commit, in Github a pull request can be entered. The bot takes over from there.

When the pull request has been accepted, the Github API also has the new data and it is pushed to npm within a few hours as a package called [@types/thunderbird-webext-browser](https://www.npmjs.com/package/@types/thunderbird-webext-browser). The package manager can show information about the package:

```shell
pnpm info @types/thunderbird-webext-browser
```
