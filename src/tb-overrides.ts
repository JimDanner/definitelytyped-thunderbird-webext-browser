// THUNDERBIRD_126_0b1_RELEASE FIREFOX_109_0b9_RELEASE
import Converter from './converter';

/**
 * Correct some incompatibilities and mistakes in the Thunderbird schemas
 * @param converter the object that is parsing the JSON schemas
 */
export default function tb_override(converter: Converter) {

    // in TB 127's folders.json, the undocumented function getUnifiedFolder has
    // a nameless parameter (!) which leads to an invalid declaration
    converter.remove('folders', 'functions', 'getUnifiedFolder');

    // the type ThemeType in messenger.theme is defined in messenger.manifest
    converter.edit('theme', 'types', 'ThemeUpdateInfo', (x) => {
        x!.properties!.theme!['$ref'] = 'manifest.ThemeType';
        return x;
    });

    // manifest.ThemeExperiment has a mangled description
    converter.edit('_manifest', 'types', 'ThemeExperiment', (x) => {
        x!.properties!.stylesheet!.description =
            `URL to a stylesheet introducing additional CSS variables, extending
            the theme-able areas of Thunderbird.
            
            The <code>theme_experiment</code> add-on in our
            [example repository](https://github.com/thundernest/sample-extensions/tree/master/theme_experiment)
            is using the stylesheet shown below, to add the <code>--chat-button-color</code>
            CSS color variable:
            <literalinclude>includes/theme/theme_experiment_style.css<lang>CSS</lang></literalinclude>.
            
            The following <em>manifest.json</em> file maps the <value>--chat-button-color</value> CSS
            color variable to the theme color key <value>exp_chat_button</value> and uses it to
            set a color for the chat button:
            <literalinclude>includes/theme/theme_experiment_manifest.json<lang>JSON</lang></literalinclude>`;
        return x;
    });

    // windows.create() has a mangled description
    converter.edit('windows', 'functions', 'create', (x) => {
        x!.description =
            `Creates (opens) a new window with any optional sizing, position or default URL provided.
            When loading a page into a popup window, same-site links are opened within the same window,
            all other links are opened in the user\'s default browser. To override this behavior,
            add-ons have to register a
            [content script](https://bugzilla.mozilla.org/show_bug.cgi?id=1618828#c3),
            capture click events and handle them manually. Same-site links with targets other than
            <value>_self</value> are opened in a new tab in the most recent "normal" Thunderbird window.`;
        return x;
    });

    // tabs.create() has a mangled description
    converter.edit('tabs', 'functions', 'create', (x) => {
        x!.description =
            `Creates a new content tab. Use the :ref:\`messageDisplay_api\` to open messages.
            Only supported in <value>normal</value> windows. Same-site links in the loaded page
            are opened within Thunderbird, all other links are opened in the user's default browser.
            To override this behavior, add-ons have to register a 
            [content script](https://bugzilla.mozilla.org/show_bug.cgi?id=1618828#c3),
            capture click events and handle them manually.`;
        return x;
    });

    // menus.MenuIconDictionary has a mangled description
    converter.edit('menus', 'types', 'MenuIconDictionary', (x) => {
        x!.description =
            `A <em>dictionary object</em> to specify paths for multiple icons in different sizes,
            so the best matching icon can be used, instead of scaling a standard icon to fit the
            pixel density of the user's display. Each entry is a <em>name-value</em> pair, with
            <em>name</em> being a size and <em>value</em> being a :ref:\`menus.MenuIconPath\`.
            Example: <literalinclude>includes/IconPath.json<lang>JSON</lang></literalinclude>
            
            See the [MDN documentation about choosing icon sizes](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_action#choosing_icon_sizes) for more information on this.`;
        return x;
    });

    // menus.MenuIconPath has a mangled description
    converter.edit('menus', 'types', 'MenuIconPath', (x) => {
        x!.description =
            `Either a <em>string</em> to specify a single icon path to be used for all sizes, or a 
            <em>dictionary object</em> to specify paths for multiple icons in different sizes, so the
            icon does not have to be scaled for a device with a different pixel density. Each entry is a
            <em>name-value</em> pair with <em>name</em> being a size and <em>value</em> being a path
             to the icon for the specified size.
             Example: <literalinclude>includes/MenuIconPath.json<lang>JSON</lang></literalinclude>
             
             See the [MDN documentation about choosing icon sizes](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_action#choosing_icon_sizes)
             for more information on this.`;
        return x;
    });

    // Some functions' callbacks have an optional parameter in the schema - they should be taken to
    // return a promise holding a type OR undefined, e.g. Promise<MailAccount | undefined>.
    // But in most cases that seems to be an error in the schemas, not backed by the online
    // documentation - see https://github.com/jsmnbom/definitelytyped-firefox-webext-browser/issues/21
    // Also, Thunderbird may actually pass in the value null instead of undefined/no argument.
    // We manually put in the optional undefined or null in those places where it applies.
    // (For the Firefox APIs the other script, overrides.ts, does this)
    // This code follows the list from one of the Thunderbird developers involved:
    // https://github.com/thunderbird/webext-docs/issues/56#issuecomment-2085352524
    function addNullOption(fnc: TypeSchema) {
        fnc.parameters!.slice(-1)[0].converterPromiseOptionalNull = true;
        return fnc;
    }
    function addUndefinedOption(fnc: TypeSchema) {
        fnc.parameters!.slice(-1)[0].converterPromiseOptional = true;
        return fnc;
    }
    // The developer says the promise can really be empty (i.e. hold the value undefined):
    converter.edit('cloudFile', 'functions', 'getAccount', addUndefinedOption);
    converter.edit('cloudFile', 'functions', 'updateAccount', addUndefinedOption);
    converter.edit('mailTabs', 'functions', 'getCurrent', addUndefinedOption);
    converter.edit('sessions', 'functions', 'getTabValue', addUndefinedOption);
    converter.edit('tabs', 'functions', 'getCurrent', addUndefinedOption);
    // The developer says the promise can really hold the value null:
    converter.edit('action', 'functions', 'getLabel', addNullOption);
    converter.edit('accounts', 'functions', 'get', addNullOption);
    converter.edit('accounts', 'functions', 'getDefault', addNullOption);
    converter.edit('accounts', 'functions', 'getDefaultIdentity', addNullOption);
    converter.edit('contacts', 'functions', 'getPhoto', addNullOption);
    converter.edit('identities', 'functions', 'get', addNullOption);
    converter.edit('identities', 'functions', 'getDefault', addNullOption);
    converter.edit('messageDisplay', 'functions', 'getDisplayedMessage', addNullOption);
}
