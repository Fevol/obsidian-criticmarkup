import { Plugin } from 'obsidian';
import { inlinePlugin } from './editor/live-preview';

export default class CriticMarkupPlugin extends Plugin {

	async onload() {
		const extension = inlinePlugin();
		this.registerEditorExtension(extension);
	}

	onunload() {}
}
