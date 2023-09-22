import { type EventRef, type MarkdownView, setIcon } from 'obsidian';
import type CommentatorPlugin from '../../main';

export class HeaderButton {
	active_mapping: WeakMap<MarkdownView, {
		button: HTMLElement,
		status: HTMLElement | null,
	}> = new WeakMap();

	changeEvent: EventRef | null = null;
	index: number = 0;

	constructor(private attribute: keyof typeof plugin.settings, private states: { icon: string, tooltip: string, text: string }[],
				private has_label: boolean, private cls: string, private plugin: CommentatorPlugin) {
		this.index = + this.plugin.settings[this.attribute];
	}

	renderButtons() {
		this.changeEvent = this.plugin.app.workspace.on('layout-change', this.attachButtons.bind(this));
		this.attachButtons();
	}

	attachButtons() {
		const { icon, tooltip, text } = this.states[this.index];
		for (const leaf of this.plugin.app.workspace.getLeavesOfType('markdown')) {
			const view = leaf.view as MarkdownView;
			if (this.active_mapping.has(view)) continue;

			const button = view.addAction(icon, tooltip, async () => await this.updateButtons.bind(this)());
			const status = this.has_label ? button.createSpan({ text, cls: this.cls }) : null;

			if (this.has_label)
				// @ts-ignore (Parent element exists)
				button.parentElement.insertBefore(status, button);

			this.active_mapping.set(view, { button, status });
		}
	}

	async updateButtons(new_index?: number) {
		if (new_index) {
			this.index = new_index;
		} else {
			this.index = (this.index + 1) % this.states.length;
			await this.plugin.setSetting(this.attribute, this.index)
		}

		if (!this.changeEvent) return;

		const { icon, tooltip, text } = this.states[this.index];
		for (const leaf of this.plugin.app.workspace.getLeavesOfType('markdown')) {
			const view = leaf.view as MarkdownView;
			const elements = this.active_mapping.get(view);
			if (!elements) continue;

			setIcon(elements.button, icon);
			elements.button.setAttribute('aria-label', tooltip);
			if (this.has_label)
				elements.status!.innerText = text;
		}
	}

	detachButtons() {
		if (!this.changeEvent) return;

		for (const leaf of this.plugin.app.workspace.getLeavesOfType('markdown')) {
			const view = leaf.view as MarkdownView;
			const elements = this.active_mapping.get(view);
			if (!elements) continue;

			elements.button.detach();
			elements.status?.detach();

			this.active_mapping.delete(view);
		}
		this.plugin.app.workspace.offref(this.changeEvent!);
		this.changeEvent = null;
	}
}
