import type CommentatorPlugin from '../../main';
import { Menu, setIcon } from 'obsidian';

export class StatusBarButton {
	button: HTMLElement | null = null;
	index: number = 0;

	constructor(private attribute: keyof typeof plugin.settings, private states: { icon: string, text: string }[],
				private plugin: CommentatorPlugin, render = false) {
		this.index = +this.plugin.settings[this.attribute]!;
		this.setRendering(render);
	}

	showMenu(e: MouseEvent) {
		const menu = new Menu();
		for (const [index, state] of this.states.entries()) {
			menu.addItem((item) => {
				item.setTitle(state.text);
				item.setIcon(state.icon);
				item.setChecked(index === this.index);
				item.onClick(async () => {
					await this.plugin.setSetting(this.attribute, index);
				});
			});
		}
		menu.showAtMouseEvent(e);
	}

	setRendering(render?: boolean) {
		if (render === undefined || render === !!this.button) return;

		render ? this.renderButton() : this.detachButton();
	}

	updateButton(new_index?: number | boolean) {
		if (new_index === undefined || +new_index === this.index) return;

		this.index = +new_index;
		if (!this.button) return;

		const { icon, text } = this.states[this.index];
		setIcon(this.button, icon);
		this.button.setAttribute('aria-label', text);
	}

	renderButton() {
		const { icon, text } = this.states[this.index];

		this.button = this.plugin.addStatusBarItem();
		const span = this.button.createSpan({ cls: 'status-bar-item-icon' });

		setIcon(span, icon);
		this.button.classList.add('mod-clickable');
		this.button.setAttribute('aria-label', text);
		this.button.setAttribute('data-tooltip-position', 'top');
		this.button.addEventListener('click', (e) => this.showMenu(e));
		this.button.addEventListener('contextmenu', (e) => this.showMenu(e));

	}

	detachButton() {
		this.button?.detach();
	}
}
