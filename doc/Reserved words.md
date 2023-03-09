# Reserved words issue
Some properties in the Thunderbird API have names that are also reserved keywords. For example, there is `messenger.messages.delete()`, while `delete` is a JavaScript keyword. In the type declaration file, it is to be declared inside the `messenger.messages` namespace, which would look like

```ts
function delete(messageIds: number[], skipTrash?: boolean): Promise<any>; // TypeScript error
```

This would be a syntax error because of the reserved keyword. In the Firefox API, such cases do not occur; in Thunderbird, there are various properties called `delete` or `import`.

## Solutions
For each solution, I have tried to ascertain whether it works in VS Code and in WebStorm.

### 1. Define under different name + export under right name
The project definitelytyped-firefox-webext-browser, from which this one is derived, deals with reserved words in the following way.

1. define the item but use a different name: the original name preceded by `_`
  ```ts
  function _delete(messageIds: number[], skipTrash?: boolean): Promise<any>;
```
2. within the same namespace, explicitly export the function using the original name
  ```ts
  export {_delete as delete};
  ```

In this form it's no longer a syntax error, and the function is available under its correct name `delete`.

In **WebStorm** it mostly works; the only (minor) drawback is that the `_delete` name is also present in the namespace – the editor gives it as a suggestion after you type `messenger.messages.` . The unattentive programmer might use that version, which isn't really in the API, thus producing code that doesn't work. *Note*: trying to avoid the addition of the name `_delete` into the namespace by not using that name and exporting an anonymous function,

```ts
export {function(messageIds: number[], skipTrash?: boolean): Promise<any> as delete};
```

doesn't work; the export fails.

In **VS Code** it breaks things. For some reason, if anything is explicitly `export`ed from a namespace, all the other things in the namespace are ignored by this editor. So the export statement means that `messenger.messages.list()`, `.get()`, `.move()` and dozens of other things are completely invisible: not suggested (by 'Intellisense') when typing, no documentation on mouse-over, and so on.

**Conclusion**: not really a viable solution.

### 2. Declare as property in the parent namespace
The next thing we try is to declare it again under another name `_delete` and then, in the parent namespace `messenger`, we put

```ts
messages['delete'] = messages._delete;
```

so there's no `export` statement that can trip up VS Code.

**WebStorm**: The documentation string on mouseover of a `messenger.messages.delete()` call is correct and the item is in the autocomplete suggestions, but it isn't *really* available in the IDE: the parameters aren't annotated in the code or checked for correctness. Not fully usable.

**VS Code**: The `.delete` function seems not to exist.

**Conclusion**: This doesn't work.

### 3. Import from child namespace
The reverse of idea 2:

```ts
namespace auxChildNs {
    function _delete(messageIds: number[], skipTrash?: boolean): Promise<any>;
}
import {_delete as delete} from auxChildNs;
```

but this fails because it tries to put an entity named `delete` in the current namespace. If that were allowed, we wouldn't have this problem in the first place.

**Conclusion**: This doesn't work.

### 4. Solution 1 + exporting every item
If we create an `export` statement for everything we need in the IDE, then VS Code will have everything available. In itself this probably works, but it is a lot of coding to get it right. What exactly are the items that require such a statement? We will do it for the things listed in the `convertNamespace` function below the comment *Convert everything*:

* Types: with keyword `type` or `interface`, implemented in the `covertType`, `convertTypes` and `convertSingleEvent` methods. 
* Properties: `const`, implemented in `convertProperties` and `convertEvent`
* Functions: `function`, implemented in `convertSingleFunction` (and we'll not export the original one with the underscore name)
* Namespaces: `namespace`, mainly because nested namespaces like `messenger.addressBooks.provider` would be made invisible by the export of items in the parent namespace.

So we put `export` in front of each of them (when we're not creating it for WebStorm).

**WebStorm**: works OK (and we can create a version without the export keywords)

**VS Code** works OK.

**Conclusion**: We will use this.


