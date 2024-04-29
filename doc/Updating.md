# Updating the tool
When the Thunderbird API has changed, this typefile-generator probably needs to be updated too. Here are the things to change.

## Random changes
First of all, there may be assorted random changes in the documentation and contents of the API. For example, the documentation webpage has a table of APIs, and their names were changed from _table_ etc. to _table API_ from Thunderbird 109 to 115. This tripped up `converter.ts` as it was trying to use the nonexistent _table API_ namespace.

So **testing the program** and looking carefully at its console output is needed.

Also, **looking through the result**, i.e. the `index.d.ts` file, to see if anything looks weird. Often the `prettify` library that finishes up the file will print errors about anomalies such as missing stuff and functions with missing parameters, but that is not guaranteed.

## Overrides
The main version-dependent part of the program is its overrides function, implemented in `tb-overrides.ts` (and in `overrides.ts` for the Firefox APIs, but we copy that from the Firefox definitions generator as it would be a bit much to maintain that too). This has a list of things that must be changed because they aren't in the JSON files in a fully usable form.

From time to time, it is useful to check whether the things on it are still needed, and whether new problems have been added:

* See [the list](Converter.md#optional-promises) of 'optional' callback parameters, whose entries in the JSON files specify 'optional' but the actual argument to the callback can't in every case be `undefined` or `null`. A script may help tease out these instances:
    ```
    node scripts/find-optional-callback-params.js -t <TAG>
  ```
* See the other things in the override function: are they still a problem that needs overriding? Or have the JSON files been corrected?

## Deeper changes
It is possible that the whole API would change in more profound ways. For example, in `downloads.ts` we define lists `BASIC_APIS` and `ADDED_APIS` of namespaces that must be added in, beyond what is documented or has its own JSON file; these lists were found by trial and error, and if the basis of the API is changed, we will have to find out what changed by pooring through error messages and wrong results in the output file.

Let's hope this doesn't happen often.