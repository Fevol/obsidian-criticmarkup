import { App, PluginSettingTab } from "obsidian";
import type CommentatorPlugin from "../main";

import { mount, unmount } from "svelte";
import { SettingsPage } from "./pages";

export class CommentatorSettings extends PluginSettingTab {
	plugin: CommentatorPlugin;
	private view: ReturnType<typeof SettingsPage> | null = null;

	constructor(app: App, plugin: CommentatorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		this.view = mount(SettingsPage, {
			target: this.containerEl,
			props: {
				plugin: this.plugin,
			},
		});
	}

	hide(): void {
		super.hide();
		if (this.view) {
			unmount(this.view);
		}
	}
}
