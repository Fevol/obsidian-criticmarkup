import { App, PluginSettingTab } from "obsidian";
import type CommentatorPlugin from "../main";

import { type SvelteComponent } from "svelte";
import { SettingsPage } from "./pages";

export class CommentatorSettings extends PluginSettingTab {
	plugin: CommentatorPlugin;
	private view: SvelteComponent | null = null;

	constructor(app: App, plugin: CommentatorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		this.view = new SettingsPage({
			target: containerEl,
			props: {
				plugin: this.plugin,
			},
		});
	}

	hide(): void {
		super.hide();
		this.view!.$destroy();
	}
}
