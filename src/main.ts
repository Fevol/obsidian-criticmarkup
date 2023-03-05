import { Plugin, Platform, ItemView, setIcon } from 'obsidian';
import { inlinePlugin } from './editor/live-preview';
import { postProcess } from './editor/post-processor';

import {commands} from './editor/commands';
import { change_suggestions } from './editor/context-menu-commands';
// import { file_view_modes } from './editor/file-menu-commands';
import type { Extension } from '@codemirror/state';

export default class CriticMarkupPlugin extends Plugin {
	private editorExtensions: Extension[] = [];
	
	editor_status: number = 0;

	post_processor: any;
	
	async onload() {
		const button_mapping = new WeakMap<ItemView, HTMLElement>();

		const status_mapping = [
			{ icon: "message-square", label: "Preview \"accept all\"" },
			{ icon: "check", label: "Preview \"accept all\"" },
			{ icon: "cross", label: "Preview \"reject all\"" },
		];
		
		this.registerEvent(app.workspace.on("layout-change", () => {
			for (const leaf of app.workspace.getLeavesOfType("markdown")) {
				const view = leaf.view as ItemView;
				if (button_mapping.has(view)) continue;

				const buttonElement = view.addAction("message-square", "View all suggestions", () => {
					this.editor_status = (this.editor_status + 1) % status_mapping.length;
					const { icon, label } = status_mapping[this.editor_status];
					setIcon(buttonElement, icon);
					buttonElement.setAttribute("aria-label", label);
					this.updateEditorExtension();
				});
				button_mapping.set(view, buttonElement);
			}
		}))
		
		this.editorExtensions.push(inlinePlugin({
			status: this.editor_status,
		}));
		
		this.registerEditorExtension(this.editorExtensions);
		this.post_processor = this.registerMarkdownPostProcessor((el, ctx) => postProcess(el, ctx));


		this.registerEvent(change_suggestions);
		// this.registerEvent(file_view_modes);

		for (const command of commands) {
			if (Platform.isMobile || command.editor_context) {
				command.editorCallback = command.callback;
				delete command.callback;
			}

			this.addCommand(command);
		}
	}
	
	
	updateEditorExtension() {
		this.editorExtensions.length = 0;

		this.editorExtensions.push(inlinePlugin({
			status: this.editor_status,
		}));

		this.app.workspace.updateOptions();
	}

	onunload() {}
}
