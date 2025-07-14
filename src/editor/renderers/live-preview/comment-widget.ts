import { EditorView, WidgetType } from "@codemirror/view";

import { App, Component, editorInfoField, MarkdownRenderer, Menu, setIcon } from "obsidian";

import { addCommentToView, CM_All_Brackets, CommentRange, CriticMarkupRange } from "../../base";
import { annotationGutterFocusAnnotation } from "../gutters/annotations-gutter";

export function renderCommentWidget(app: App, range: CommentRange, text?: string, unwrap = false) {
	let str = text ?? range.text;
	if (!text && unwrap) {
		if (range.to >= str.length && !str.endsWith(CM_All_Brackets[range.type].at(-1)!))
			str = range.unwrap_bracket(true);
		else
			str = range.unwrap();
	}

	const icon = document.createElement("span");
	icon.classList.add("cmtr-comment-icon");
	setIcon(icon, "message-square");
	let tooltip: HTMLElement | null = null;
	const component = new Component();
	icon.onmouseenter = () => {
		if (tooltip) return;

		tooltip = document.createElement("div");
		tooltip.classList.add("cmtr-comment-tooltip");
		MarkdownRenderer.render(app, str, tooltip, "", component);
		component.load();
		icon!.appendChild(tooltip);

		// Set tooltip position
		const icon_rect = icon!.getBoundingClientRect();
		const tooltip_rect = tooltip.getBoundingClientRect();
		tooltip.style.left = icon_rect.x - tooltip_rect.x + 12 + "px";
	};

	icon.onmouseleave = () => {
		if (tooltip) {
			component.unload();
			icon!.removeChild(tooltip!);
			tooltip = null;
		}
	};

	return icon;
}

export class CommentIconWidget extends WidgetType {
	tooltip: HTMLElement | null = null;
	icon: HTMLElement | null = null;

	component: Component;
	focused = false;

	constructor(private view: EditorView, public range: CriticMarkupRange, public annotation_gutter = false) {
		super();
		this.component = new Component();
	}

	renderTooltip() {
		if (!this.tooltip) {
			this.tooltip = createDiv({ cls: "cmtr-comment-tooltip" });
			const { app } = this.view.state.field(editorInfoField);
			MarkdownRenderer.render(app, this.range.unwrap(), this.tooltip, "", this.component);
			this.component.load();
			this.icon!.appendChild(this.tooltip);

			// Set tooltip position
			const icon_rect = this.icon!.getBoundingClientRect();
			const tooltip_rect = this.tooltip.getBoundingClientRect();
			this.tooltip.style.left = icon_rect.x - tooltip_rect.x - tooltip_rect.width / 2 + 12 + "px";
		}
	}

	focusAnnotation(e: Event) {
		// TODO: Check if this is (much) worse than directly invoking the focus annotation function from the gutter plugin instance
		//      The other options can piggy-back on already existing transactions, and just annotating them
		//      However, this one doesn't have one (except if clicking on the widget _is_ a transaction)
		this.view.dispatch({ annotations: [ annotationGutterFocusAnnotation.of({ from: this.range.from, to: this.range.to }) ] });
	}

	unrenderTooltip() {
		if (!this.focused && this.tooltip) {
			this.component.unload();
			this.icon!.removeChild(this.tooltip!);
			this.tooltip = null;
		}
	}

	toDOM(view: EditorView): HTMLElement {
		this.icon = document.createElement("span");
		this.icon.classList.add("cmtr-comment-icon");
		setIcon(this.icon, "message-square");

		// DEBUG: Add line under icon to check alignment of annotation gutter element with widget
		// const line = document.createElement('div');
		// line.classList.add('cmtr-debug-comment-line');
		// this.icon.appendChild(line);

		if (this.annotation_gutter) {
			this.icon.onclick = (e) => this.focusAnnotation(e);
			this.icon.oncontextmenu = (e) => {
				e.preventDefault();

				const menu = new Menu();
				menu.addItem((item) => {
					item.setTitle("Focus annotation")
						.setIcon("eye")
						.onClick((e) => this.focusAnnotation(e));
				});
				menu.addItem((item) => {
					item.setTitle("Add comment")
						.setIcon("message-square")
						.onClick((e) => {
							e.preventDefault();
							addCommentToView(view, this.range);
						});
				});

				menu.showAtMouseEvent(e);
			};
		}

		if (this.range.length) {
			this.icon.onmouseenter = () => {
				this.renderTooltip();
			};
			this.icon.onclick = () => {
				this.renderTooltip();
				this.focused = true;
			};

			this.icon.onmouseleave = () => {
				this.unrenderTooltip();
				// TODO: Find a better way to check if the tooltip is still focused (requires a document.click listener -> expensive?); .onblur does not work
				this.focused = false;
			};
		}

		// this.icon.onblur = () => {
		// 	this.focused = false;
		// 	this.unrenderTooltip();
		// }

		return this.icon;
	}
}
