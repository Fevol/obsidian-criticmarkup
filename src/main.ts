import { App, Plugin } from 'obsidian';
import type { TemplateSettings } from './interfaces';
//import TemplateSettingTab from './settings';
import {criticmarkupLanguage} from 'lang-criticmarkup'
import { inlinePlugin } from "./lp"

const DEFAULT_SETTINGS: TemplateSettings = {};

export default class TemplatePlugin extends Plugin {
	//settings: TemplateSettings;

	async onload() {
		console.log('loading ... plugin');
		const ext = inlinePlugin();
		this.registerEditorExtension(ext)

/*
		await this.loadSettings();

		this.addSettingTab(new TemplateSettingTab(this.app, this));
	}

	buildCMPlugin() {
		const viewPlugin = viewPlugin.fromClass(
			class {}
		)
		return viewPlugin
*/

	}


	onunload() {
		console.log('unloading ... plugin');
	}

/*
	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
*/
}
