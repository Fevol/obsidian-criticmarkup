import { Plugin, Platform } from 'obsidian';
import { inlinePlugin } from './editor/live-preview';
import { postProcess } from './editor/post-processor';

import {commands} from './editor/commands';

export default class CriticMarkupPlugin extends Plugin {

	async onload() {
		const extension = inlinePlugin();
		this.registerEditorExtension(extension);
		this.registerMarkdownPostProcessor((el, ctx) => postProcess(el, ctx));


		for (const command of commands) {
			if (Platform.isMobile || command.editor_context) {
				command.editorCallback = command.callback;
				delete command.callback;
			}

			this.addCommand(command);
		}
	}

	onunload() {}
}
