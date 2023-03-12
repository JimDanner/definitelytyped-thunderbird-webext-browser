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
