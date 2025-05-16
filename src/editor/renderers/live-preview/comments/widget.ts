import { EditorView, WidgetType } from "@codemirror/view";

import { Component, MarkdownRenderer, Menu, setIcon } from "obsidian";

import { COMMENTATOR_GLOBAL } from "../../../../global";
import { CM_All_Brackets, CommentRange, CriticMarkupRange } from "../../../base";
import { annotationGutterMarkers } from "../../gutters";
import { addCommentToView } from "../../gutters/annotations-gutter";

export function renderCommentWidget(range: CommentRange, text?: string, unwrap = false) {
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
		MarkdownRenderer.render(COMMENTATOR_GLOBAL.app, str, tooltip, "", component);
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

	constructor(public range: CriticMarkupRange, public annotation_gutter = false) {
		super();
		this.component = new Component();
	}

	renderTooltip() {
		if (!this.tooltip) {
			this.tooltip = document.createElement("div");
			this.tooltip.classList.add("cmtr-comment-tooltip");
			MarkdownRenderer.render(COMMENTATOR_GLOBAL.app, this.range.text, this.tooltip, "", this.component);
			this.component.load();
			this.icon!.appendChild(this.tooltip);

			// Set tooltip position
			const icon_rect = this.icon!.getBoundingClientRect();
			const tooltip_rect = this.tooltip.getBoundingClientRect();
			this.tooltip.style.left = icon_rect.x - tooltip_rect.x - tooltip_rect.width / 2 + 12 + "px";
		}
	}

	focusAnnotation(view: EditorView, e: Event) {
		const gutterElements = view.state.field(annotationGutterMarkers);
		e.preventDefault();
		gutterElements.between(this.range.from, this.range.to, (from, to, widget) => {
			if (this.range.equals(widget.annotation)) {
				widget.annotation_thread!.dispatchEvent(new MouseEvent("click"));
				return false;
			}
		});
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
			this.icon.onclick = (e) => this.focusAnnotation(view, e);

			this.icon.oncontextmenu = (e) => {
				e.preventDefault();

				const menu = new Menu();
				menu.addItem((item) => {
					item.setTitle("Focus annotation")
						.setIcon("eye")
						.onClick(this.focusAnnotation.bind(this, view));
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
		} else {
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
		}

		// this.icon.onblur = () => {
		// 	this.focused = false;
		// 	this.unrenderTooltip();
		// }

		return this.icon;
	}
}
