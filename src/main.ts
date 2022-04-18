import { App, Plugin } from 'obsidian';
import type { TemplateSettings } from './interfaces';
import TemplateSettingTab from './settings';

const DEFAULT_SETTINGS: TemplateSettings = {};

export default class TemplatePlugin extends Plugin {
	//@ts-ignore
	settings: TemplateSettings;

	async onload() {
		console.log('loading ... plugin');

		await this.loadSettings();

		this.addSettingTab(new TemplateSettingTab(this.app, this));
	}

	onunload() {
		console.log('unloading ... plugin');
	}

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
}
