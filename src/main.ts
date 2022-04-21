import { App, Plugin } from 'obsidian';
import type { TemplateSettings } from './interfaces';
//import TemplateSettingTab from './settings';
import {criticmarkupLanguage} from 'lang-criticmarkup'

const DEFAULT_SETTINGS: TemplateSettings = {};

export default class TemplatePlugin extends Plugin {
	//settings: TemplateSettings;

	async onload() {
		console.log('loading ... plugin');

/*
		await this.loadSettings();

		this.addSettingTab(new TemplateSettingTab(this.app, this));
		const ext = this.buildCMPlugin();
		this.registerEditorExtension(ext)
	}

	buildCMPlugin() {
		const viewPlugin = viewPlugin.fromClass(
			class {}
		)
		return viewPlugin
*/

		this.registerEvent(
			this.app.workspace.on('active-leaf-change', (leaf) => {
				if (leaf && (leaf.getViewState().type === 'markdown')) {
					const content = leaf.view.editor.getValue() as string
					const tree = criticmarkupLanguage.parser.parse(content)
					console.log(tree)
					const cursor = tree.cursor()
					do {
						console.log(`Node ${cursor.name} from ${cursor.from} to ${cursor.to}`)
					} while (cursor.next())
				}
			})
		)
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
