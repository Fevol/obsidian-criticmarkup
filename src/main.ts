import { Plugin, Platform } from 'obsidian';
import { inlinePlugin } from './editor/live-preview';
import { postProcess } from './editor/post-processor';

import {commands} from './editor/commands';
import { change_suggestions } from './editor/context-menu-commands';

export default class CriticMarkupPlugin extends Plugin {

	async onload() {
		this.registerEditorExtension([inlinePlugin()]);
		this.registerMarkdownPostProcessor((el, ctx) => postProcess(el, ctx));
		this.registerEvent(change_suggestions);

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
