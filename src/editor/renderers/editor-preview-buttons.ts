import { MarkdownView, setIcon } from 'obsidian';

import type CommentatorPlugin from '../../main';

const button_mapping = new WeakMap<MarkdownView, {
	button: HTMLElement,
	status: HTMLElement,
}>();

export function loadPreviewButtons(plugin: CommentatorPlugin) {
	const status_mapping = [
		{ icon: 'message-square', tooltip: 'Show all suggestions', label: 'Showing suggestions' },
		{ icon: 'check', tooltip: 'Preview "accept all"', label: 'Previewing "accept all"' },
		{ icon: 'cross', tooltip: 'Preview "reject all"', label: 'Previewing "reject all"' },
	];

	for (const leaf of app.workspace.getLeavesOfType('markdown')) {
		const view = leaf.view as MarkdownView;
		if (button_mapping.has(view)) continue;

		const { icon, tooltip, label } = status_mapping[plugin.settings.preview_mode];

		const buttonElement = view.addAction(icon, tooltip, () => {
			plugin.settings.preview_mode = (plugin.settings.preview_mode + 1) % status_mapping.length;
			const { icon, tooltip, label } = status_mapping[plugin.settings.preview_mode];
			setIcon(buttonElement, icon);
			buttonElement.setAttribute('aria-label', tooltip);
			statusElement.innerText = label;
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

export async function removePreviewButtons() {
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
