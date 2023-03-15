import { MarkdownView, setIcon } from 'obsidian';

import type CommentatorPlugin from '../main';

const button_mapping = new WeakMap<MarkdownView, {
	button: HTMLElement,
	status: HTMLElement,
}>();

const status_mapping = [
	{ icon: 'pencil', tooltip: 'Directly edit document',  label: 'Editing' },
	{ icon: 'edit', tooltip: 'Mark edits as suggestions', label: 'Suggesting',  },
];

export function loadSuggestButtons(plugin: CommentatorPlugin) {
	for (const leaf of app.workspace.getLeavesOfType('markdown')) {
		const view = leaf.view as MarkdownView;
		if (button_mapping.has(view)) continue;

		const { icon, tooltip, label } = status_mapping[+plugin.settings.suggest_mode];

		const buttonElement = view.addAction(icon, tooltip, () => {
			plugin.settings.suggest_mode = !plugin.settings.suggest_mode;
			updateSuggestButtons(plugin);
			plugin.saveSettings();
		});

		const statusElement = buttonElement.createSpan({
			text: label,
			cls: 'criticmarkup-suggestion-status',
		});

		// @ts-ignore (Parent element exists)
		buttonElement.parentElement.insertBefore(statusElement, buttonElement);

		button_mapping.set(view, {
			button: buttonElement,
			status: statusElement,
		});
	}
}

export async function updateSuggestButtons(plugin: CommentatorPlugin) {
	for (const leaf of app.workspace.getLeavesOfType('markdown')) {
		const view = leaf.view as MarkdownView;
		if (!button_mapping.has(view)) continue;
		const elements = button_mapping.get(view);
		if (elements) {
			const { icon, tooltip, label } = status_mapping[+plugin.settings.suggest_mode];
			setIcon(elements.button, icon);
			elements.button.setAttribute('aria-label', tooltip);
			elements.status.innerText = label;
		}
	}
}

export async function removeSuggestButtons() {
	for (const leaf of app.workspace.getLeavesOfType('markdown')) {
		const view = leaf.view as MarkdownView;
		if (!button_mapping.has(view)) continue;
		const elements = button_mapping.get(view);
		if (elements) {
			elements.button.detach();
			elements.status.detach();
		}
		button_mapping.delete(view);
	}
}