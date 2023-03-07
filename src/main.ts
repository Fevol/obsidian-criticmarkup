import { Plugin, Platform, setIcon, MarkdownView } from 'obsidian';
import { inlinePlugin } from './editor/live-preview';
import { postProcess } from './editor/post-processor';

import {commands} from './editor/commands';
import { change_suggestions } from './editor/context-menu-commands';
import type { Extension } from '@codemirror/state';
import { bracketMatcher, nodeCorrecter } from './editor/editor-extensions';

export default class CriticMarkupPlugin extends Plugin {
	private editorExtensions: Extension[] = [];

	settings: { suggestion_status: number; } = {
		suggestion_status: 0,
	}

	button_mapping = new WeakMap<MarkdownView, {
		button: HTMLElement,
		status: HTMLElement,
	}>();


	loadButtons() {
		const status_mapping = [
			{ icon: "message-square", tooltip: "Show all suggestions", label: "Showing suggestions"  },
			{ icon: "check", tooltip: "Preview \"accept all\"", label: "Previewing \"accept all\"" },
			{ icon: "cross", tooltip: "Preview \"reject all\"" , label: "Previewing \"reject all\"" },
		];

		for (const leaf of app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view as MarkdownView;
			if (this.button_mapping.has(view)) continue;

			const buttonElement = view.addAction("message-square", "View all suggestions", () => {
				this.settings.suggestion_status = (this.settings.suggestion_status + 1) % status_mapping.length;
				const { icon, tooltip, label } = status_mapping[this.settings.suggestion_status];
				setIcon(buttonElement, icon);
				buttonElement.setAttribute("aria-label", tooltip);
				statusElement.innerText = label;
				this.updateEditorExtension();
			});

			const statusElement = buttonElement.createSpan({
				text: status_mapping[this.settings.suggestion_status].label,
				cls: "criticmarkup-suggestion-status"
			});

			// @ts-ignore (Parent element exists)
			buttonElement.parentElement.insertBefore(statusElement, buttonElement);

			this.button_mapping.set(view, {
				button: buttonElement,
				status: statusElement,
			});
		}
	}

	async onload() {
		this.loadButtons();
		this.registerEvent(app.workspace.on("layout-change", () => this.loadButtons()));
		this.editorExtensions.push(inlinePlugin(this.settings));
		this.editorExtensions.push(bracketMatcher);
		// this.editorExtensions.push(nodeCorrecter);
		
		this.registerEditorExtension(this.editorExtensions);
		this.registerMarkdownPostProcessor((el, ctx) => postProcess(el, ctx, this.settings));

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
	
	
	async updateEditorExtension() {
		this.editorExtensions.length = 0;

		this.editorExtensions.push(inlinePlugin(this.settings));

		// TODO: Check if this should only apply to the active editor instance
		for (const leaf of app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view as MarkdownView;

			const scroll_height = view.previewMode.renderer.previewEl.scrollTop;
			view.previewMode.renderer.clear();
			view.previewMode.renderer.set(view.editor.cm.state.doc.toString());
			// FIXME: Visual glitch, previewmode jumps to the top, looks jarring
			setTimeout(() => view.previewMode.renderer.previewEl.scrollTop = scroll_height, 0);
		}

		this.app.workspace.updateOptions();
	}

	async onunload() {
		for (const leaf of app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view as MarkdownView;
			if (!this.button_mapping.has(view)) continue;
			const elements = this.button_mapping.get(view);
			if (elements) {
				elements.button.detach();
				elements.status.detach();
			}
			this.button_mapping.delete(view);
		}
	}
}
