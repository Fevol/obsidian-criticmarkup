import { type EventRef, MarkdownView, Menu, setIcon, WorkspaceLeaf } from "obsidian";
import type CommentatorPlugin from "../../main";

export class HeaderButton {
	active_mapping: WeakMap<MarkdownView, {
		button: HTMLElement;
		status: HTMLElement | null;
		event: EventRef;
	}> = new WeakMap();

	changeEvent: EventRef | null = null;

	constructor(
		private states: { icon: string; tooltip: string; text: string }[],
		private has_label: boolean,
		private cls: string,
		private onchange: (view: MarkdownView, value: number) => void,
		private getvalue: (view: MarkdownView) => number,
		private plugin: CommentatorPlugin,
		render = false,
	) {
		this.setRendering(render);
	}

	setRendering(render?: boolean) {
		if (render === undefined || render === !!this.changeEvent) return;

		render ? this.attachButtons() : this.detachButtons();
	}

	setLabelRendering(render?: boolean) {
		if (render === undefined || !this.changeEvent || render === this.has_label) return;
		this.has_label = render;

		for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view as MarkdownView;
			const { text } = this.states[this.getvalue(view)];
			const elements = this.active_mapping.get(view);
			if (!elements) continue;

			if (elements.status) {
				elements.status.detach();
				elements.status = null;
			} else {
				const status = elements.button.createSpan({ text, cls: this.cls });
				// @ts-expect-error Parent element exists
				elements.button.parentElement.insertBefore(status, elements.button);
				elements.status = status;
				// this.active_mapping.set(view, elements);
			}
		}
	}

	updateButton(view: MarkdownView, value: number) {
		const elements = this.active_mapping.get(view);
		if (elements) {
			if (this.states[value]) {
				const { tooltip, text } = this.states[value];
				setIcon(elements.button, this.states[(value + 1) % this.states.length].icon);
				elements.button.setAttribute("aria-label", tooltip);
				elements.button.style.display = "";
				if (this.has_label)
					elements.status!.innerText = text;
			} else {
				elements.button.style.display = "none";
			}
		}
	}

	attachButtons() {
		if (!this.changeEvent)
			this.changeEvent = this.plugin.app.workspace.on("layout-change", this.attachButtons.bind(this));

		for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
			// Check if the view is deferred
			let { view } = leaf;
			if (!(view instanceof MarkdownView)) continue;

			if (this.active_mapping.has(view)) continue;
			const event = leaf.on("history-change", () => {
				this.updateButton(view, this.getvalue(view));
			});

			const value = this.getvalue(view);
			// FIXME: In rare cases (probably when the CM editor takes a while to instantiate)
			//		The buttons will be added _after_ the editor has loaded
			// 		This could be addresses by finding a later `layout-change` event or delaying the function
			if (value === undefined) {
				console.error("[COMMENTATOR] An attempt was made to attach the headerbutton before the CM editor instance was fully loaded")
				return;
			}

			const { tooltip, text } = this.states[value];
			const button = view.addAction(this.states[(value + 1) % this.states.length].icon, tooltip, async () => {
				const value = (this.getvalue(view) + 1) % this.states.length;
				this.onchange(view, value);
			});
			const status = this.has_label ? button.createSpan({ text, cls: this.cls }) : null;

			if (this.has_label) {
				// @ts-expect-error Parent element exists
				button.parentElement.insertBefore(status, button);
			}

			button.oncontextmenu = (e: MouseEvent) => {
				const menu = new Menu();
				const current_value = this.getvalue(view);
				for (const [i, { icon, text }] of this.states.entries()) {
					menu.addItem((item) => {
						item.setIcon(icon)
							.setTitle(text)
							.setChecked(i === current_value)
							.onClick(() => {
								this.onchange(view, i);
							});
					});
				}
				menu.showAtMouseEvent(e);
			};

			this.active_mapping.set(view, { button, status, event });
		}
	}

	detachButton(leaf: WorkspaceLeaf) {
		const view = leaf.view as MarkdownView;
		const elements = this.active_mapping.get(view);
		if (!elements) return;

		leaf.offref(elements.event);
		elements.button.detach();
		elements.status?.detach();

		this.active_mapping.delete(view);
	}

	detachButtons() {
		if (!this.changeEvent) return;

		for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown"))
			this.detachButton(leaf);
		this.plugin.app.workspace.offref(this.changeEvent!);
		this.changeEvent = null;
	}
}
