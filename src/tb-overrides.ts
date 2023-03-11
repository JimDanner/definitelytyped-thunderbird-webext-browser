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

}
