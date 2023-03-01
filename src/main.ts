import { Plugin } from 'obsidian';
import { inlinePlugin } from './editor/live-preview';
import { postProcess } from './editor/post-processor';


export default class CriticMarkupPlugin extends Plugin {

	async onload() {
		const extension = inlinePlugin();
		this.registerEditorExtension(extension);

		this.registerMarkdownPostProcessor((el, ctx) => postProcess(el, ctx));
	}

	onunload() {}
}
