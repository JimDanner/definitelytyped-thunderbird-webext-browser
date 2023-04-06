// THUNDERBIRD_109_0b4_RELEASE FIREFOX_109_0b9_RELEASE
import Converter from './converter';

/**
 * Correct some incompatibilities and mistakes in the Thunderbird schemas
 * @param converter the object that is parsing the JSON schemas
 */
export default function tb_override(converter: Converter) {

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

    // Some functions' callbacks have an optional parameter in the schema - they should return a promise
    // holding a type OR something like null or undefined, e.g. Promise<MailAccount | null>.
    // But in most cases that seems to be an error in the schemas, not backed by the online
    // documentation - see https://github.com/jsmnbom/definitelytyped-firefox-webext-browser/issues/21
    // In cases where the docs really say it, add null or undefined.
    function addNullOption(fnc: TypeSchema) {
        fnc.parameters!.slice(-1)[0].converterPromiseOptionalNull = true;
        return fnc;
    }
    function addUndefinedOption(fnc: TypeSchema) {
        fnc.parameters!.slice(-1)[0].converterPromiseOptional = true;
        return fnc;
    }
    // Documentation says the promise can really hold the value null:
    converter.edit('accounts', 'functions', 'get', addNullOption);
    converter.edit('accounts', 'functions', 'getDefault', addNullOption);
    converter.edit('identities', 'functions', 'get', addNullOption);
    // Documentation says the promise can really hold the value undefined:
    converter.edit('mailTabs', 'functions', 'getCurrent', addUndefinedOption);
    converter.edit('tabs', 'functions', 'getCurrent', addUndefinedOption);

}
