import {StateField} from "@codemirror/state";
import type CommentatorPlugin from "../../../main";
import type {PluginSettings} from "../../../types";

export let pluginSettingsField: StateField<PluginSettings>;
export function providePluginSettingsExtension(plugin: CommentatorPlugin) {
    pluginSettingsField = providePluginSettings(plugin);
    return pluginSettingsField;
}

export const providePluginSettings = (plugin: CommentatorPlugin) => StateField.define({
    create() {
        return plugin.settings;
    },
    update() {
        return plugin.settings;
    }
}) as StateField<PluginSettings>;
