import { App, Plugin } from 'obsidian';
import type { CriticSettings } from './interfaces';
//import CriticSettingTab from './settings';
import { criticmarkupLanguage } from 'lang-criticmarkup';
import { inlinePlugin } from './lp';

const DEFAULT_SETTINGS: CriticSettings = {};

export default class CriticMarkupPlugin extends Plugin {
	//settings: CriticSettings;

	async onload() {
		console.log('loading CriticMarkup plugin');
		const ext = inlinePlugin();
		this.registerEditorExtension(ext);

		/*
		await this.loadSettings();

		this.addSettingTab(new CriticSettingTab(this.app, this));
	}

        */
	}

	onunload() {
		console.log('unloading CriticMarkup plugin');
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
