import { Editor, type EventRef, MarkdownFileInfo, MarkdownView, Menu, setIcon } from "obsidian";
import type CommentatorPlugin from "../../main";

export class StatusBarButton {
	button: HTMLElement | null = null;
	value: number = 0;
	changeEvent: EventRef | null = null;
	currentView: MarkdownFileInfo | null = null;

	constructor(
		private states: { icon: string; text: string }[],
		private onchange: (view: MarkdownFileInfo | null, value: number) => void,
		private getvalue: (editor: Editor) => number,
		private plugin: CommentatorPlugin,
		render = false,
	) {
		this.setRendering(render);

		this.plugin.app.workspace.onLayoutReady(() => this.currentView = this.plugin.app.workspace.activeEditor);
	}

	showMenu(e: MouseEvent) {
		const menu = new Menu();
		for (const [index, state] of this.states.entries()) {
			menu.addItem((item) => {
				item.setTitle(state.text);
				item.setIcon(state.icon);
				item.setChecked(index === this.value);
				item.onClick(() => this.onchange(this.currentView, index));
			});
		}
		menu.showAtMouseEvent(e);
		e.preventDefault();
	}

	setRendering(render?: boolean) {
		if (render === undefined || render === !!this.button) return;

		render ? this.renderButton() : this.detachButton();
	}

	updateButton(value: number) {
		if (!this.button || value === undefined) return;

		this.value = value;
		const { icon, text } = this.states[value];
		setIcon(this.button, icon);
		this.button.setAttribute("aria-label", text);
	}

	renderButton() {
		const { icon, text } = this.states[this.value];

		this.changeEvent = this.plugin.app.workspace.on("active-leaf-change", (leaf) => {
			if (leaf && leaf.view instanceof MarkdownView) {
				this.currentView = leaf.view;
				this.updateButton(this.getvalue(leaf.view.editor));
				this.button!.style.display = "";
			} else {
				this.currentView = null;
				this.button!.style.display = "none";
			}
		});

		this.button = this.plugin.addStatusBarItem();
		const span = this.button.createSpan({ cls: "status-bar-item-icon" });

		setIcon(span, icon);
		this.button.classList.add("mod-clickable");
		this.button.setAttribute("aria-label", text);
		this.button.setAttribute("data-tooltip-position", "top");
		this.button.addEventListener("click", (e) => this.showMenu(e));
		this.button.addEventListener("contextmenu", (e) => this.showMenu(e));
	}

	detachButton() {
		if (!this.button) return;

		this.button.detach();
		this.button = null;
		this.plugin.app.workspace.offref(this.changeEvent!);
	}
}
