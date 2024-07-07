# Typescript `.d.ts` type definition files


## Nesting of the namespaces
Whether the namespaces are all at the top level, **flat**, like

```ts
declare namespace browser {
    
}
declare namespace browser.accounts {
    
}

```

or **nested**, like

```ts
declare namespace browser {
    namespace accounts {
        
    }
}
```

has an effect on the way various IDEs display documentation (from JSDoc comments) when you mouse over a namespace or other construct. 

From trying it out in VSCode and WebStorm, this is what we see. First of all, WebStorm has a bug: it doesn't show *any* JSDoc strings when mousing over a namespace. (So we can't find out what its nesting behavior would be). The workaround for this is to declare each namespace as a constant too; for that to work, the namespaces *must* be nested because you can't declare a constant like `const browser.accounts`.

| Nesting choice | Visual Studio Code                                                                                                                                  | WebStorm                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| flat           | The mouse-over documentation for `browser` contains *all* documentation strings for its child namespaces (unless they are identical), concatenated. | Would make our workaround fail |
| nested         | Works (but watch out: any `export` in a namespace annihilates its contained namespaces)                                                             | Works                          |

WebStorm isn't the only one with quirks: VSCode obliterates everything that shares a namespace with an `export` statement and doesn't have `export` itself. So if the nesting is like this:

```ts
declare namespace browser {
    export interface Settings {darkmode: boolean};
    function reboot(x: number): void;
    /** Some documentation for browser.accounts */
    namespace accounts {
        ...
    }
}
```

then the namespace `browser.accounts` and the function `browser.reboot` are shown as having type `any`, with no documentation whatsoever, and no 'Intellisense' autocompletion: the exported item is the only thing brought along by the `browser` namespace.

This creates problems when a namespace has a function called like a reserved word, like `messenger.messages.delete()`. The generator creates a function in that namespace called `_delete` and then has a statement `export {_delete as delete}` so the reserved word doesn't need to be used. But it means VS Code doesn't recognize any of the other stuff in that namespace. In Firefox this doesn't happen, in Thunderbird it does.

Conclusion: creating a fully nested system of namespaces is marginally beneficial on VSCode, and practically necessary on WebStorm. We just need to make sure there's never an `export` statement side-by-side with other items in the same container.

#### Remark on IDEs
You may wonder why IDEs deal so inconsistently with `.d.ts` (TypeScript declaration) files. I think it is because Microsoft [refuses to write an official standard](https://github.com/microsoft/TypeScript/issues/15711) for the TypeScript language. It writes fairly good tutorials, but without a formal set of rules for the parsing of TypeScript code, ambivalence remains. There's just no _official_ way to interpret a TypeScript declaration file, and the developers of IDEs (including Microsoft's own VSCode team) are left to make arbitrary choices.

## Limitations of TypeScript for WebExtensions
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