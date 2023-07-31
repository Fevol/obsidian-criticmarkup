import { App, PluginSettingTab, Setting } from "obsidian";
import type CommentatorPlugin from "../main";

export class CommentatorSettings extends PluginSettingTab {
    plugin: CommentatorPlugin;

    constructor(app: App, plugin: CommentatorPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        new Setting(containerEl)
            .setHeading()
            .setName("Suggestion Mode Settings")


        new Setting(containerEl)
            .setName("Enable Suggestion Mode")
            .addToggle(toggle => toggle.setValue(this.plugin.settings.suggest_mode)
                .onChange(async (value) => {
                    this.plugin.settings.suggest_mode = value;
                    await this.plugin.saveSettings();
                }
            ));


        new Setting(containerEl)
            .setName("Editor suggestion mode button")
            .setDesc("Add button to editor toolbar to toggle suggestion mode")
            .addToggle(toggle => toggle.setValue(this.plugin.settings.editor_suggest_button)
                .onChange(async (value) => {
                    this.plugin.settings.editor_suggest_button = value;
                    await this.plugin.saveSettings();
                }
            ));





        new Setting(containerEl)
            .setHeading()
            .setName("Editor Settings")


        new Setting(containerEl)
            .setName("Editor gutter")
            .setDesc("Show suggestion status in editor gutter")
            .addToggle(toggle => toggle.setValue(this.plugin.settings.editor_gutter)
                .onChange(async (value) => {
                        this.plugin.settings.editor_gutter = value;
                        await this.plugin.saveSettings();
                    }
                ));

        new Setting(containerEl)
            .setName("Automatic tag completion")
            .setDesc("Automatically complete CriticMarkup tags")
            .addToggle(toggle => toggle.setValue(this.plugin.settings.tag_completion)
                .onChange(async (value) => {
                        this.plugin.settings.tag_completion = value;
                        await this.plugin.saveSettings();
                    }
                ));

        new Setting(containerEl)
            .setName("Automatic tag correction")
            .setDesc("Automatically correct invalid CriticMarkup tags")
            .addToggle(toggle => toggle.setValue(this.plugin.settings.node_correcter)
                .onChange(async (value) => {
                        this.plugin.settings.node_correcter = value;
                        await this.plugin.saveSettings();
                    }
                ));

        new Setting(containerEl)
            .setName("Editor preview button")
            .setDesc("Add suggestion preview button to editor toolbar")
            .addToggle(toggle => toggle.setValue(this.plugin.settings.editor_preview_button)
                .onChange(async (value) => {
                        this.plugin.settings.editor_preview_button = value;
                        await this.plugin.saveSettings();
                    }
                ));

        new Setting(containerEl)
            .setName("Remove syntax on copy")
            .setDesc("CriticMarkup syntax will be removed when copying text to clipboard")
            .addToggle(toggle => toggle.setValue(this.plugin.settings.clipboard_remove_syntax)
                .onChange(async (value) => {
                        this.plugin.settings.clipboard_remove_syntax = value;
                        await this.plugin.saveSettings();
                }
            ));



        new Setting(containerEl)
            .setHeading()
            .setName("Style Settings")

        new Setting(containerEl)
            .setName("Show style when editing")
            .setDesc("Keep styling of CriticMarkup when editing the markup")
            .addToggle(toggle => toggle.setValue(this.plugin.settings.editor_styling)
                .onChange(async (value) => {
                    this.plugin.settings.editor_styling = value;
                    await this.plugin.saveSettings();
                }
            ));


        new Setting(containerEl)
            .setName("Hide Gutter when empty")
            .setDesc("Completely hide the gutter when there are no suggestions")
            .addToggle(toggle => toggle.setValue(this.plugin.settings.hide_empty_gutter)
                .onChange(async (value) => {
                    this.plugin.settings.hide_empty_gutter = value;
                    await this.plugin.saveSettings();
                }
            ));




        new Setting(containerEl)
            .setHeading()
            .setName("Advanced Settings")

        new Setting(containerEl)
            .setName("Reading view renderer")
            .setDesc("Toggle rendering of CriticMarkup tags in reading view mode")
            .addToggle(toggle => toggle.setValue(this.plugin.settings.post_processor)
                .onChange(async (value) => {
                        this.plugin.settings.post_processor = value;
                        await this.plugin.saveSettings();
                }
            ));

        new Setting(containerEl)
            .setName("Live preview renderer")
            .setDesc("Toggle rendering of CriticMarkup tags in live preview")
            .addToggle(toggle => toggle.setValue(this.plugin.settings.live_preview)
                .onChange(async (value) => {
                        this.plugin.settings.live_preview = value;
                        await this.plugin.saveSettings();
                }
            ));

        new Setting(containerEl)
            .setName("Alternative cursor movement")
            .setDesc("Toggle corrected cursor movement of cursor when CriticMarkup tags are present")
            .addToggle(toggle => toggle.setValue(this.plugin.settings.alternative_cursor_movement)
                .onChange(async (value) => {
                        this.plugin.settings.alternative_cursor_movement = value;
                        await this.plugin.saveSettings();
                }
            ));
    }
}
