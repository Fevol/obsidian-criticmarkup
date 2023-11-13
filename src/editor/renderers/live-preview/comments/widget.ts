import { EditorView, WidgetType } from '@codemirror/view';

import { Component, MarkdownRenderer, setIcon } from 'obsidian';

import { CriticMarkupNode } from '../../../base';
import { commentGutterMarkers } from '../../gutters';

export class CommentIconWidget extends WidgetType {
	tooltip: HTMLElement | null = null;
	icon: HTMLElement | null = null;

	component: Component;
	focused = false;

	constructor(public node: CriticMarkupNode, public is_block = false) {
		super();
		this.component = new Component();
	}

	renderTooltip() {
		if (!this.tooltip) {
			this.tooltip = document.createElement('div');
			this.tooltip.classList.add('criticmarkup-comment-tooltip');
			MarkdownRenderer.render(app, this.node.text, this.tooltip, '', this.component);
			this.component.load();
			this.icon!.appendChild(this.tooltip);

			// Set tooltip position
			const icon_rect = this.icon!.getBoundingClientRect();
			const tooltip_rect = this.tooltip.getBoundingClientRect();
			this.tooltip.style.left = icon_rect.x - tooltip_rect.x - tooltip_rect.width / 2 + 12 + 'px';
		}
	}

	unrenderTooltip() {
		if (!this.focused && this.tooltip) {
			this.component.unload();
			this.icon!.removeChild(this.tooltip!);
			this.tooltip = null;
		}
	}


	toDOM(view: EditorView): HTMLElement {
		this.icon = document.createElement('span');
		this.icon.classList.add('criticmarkup-comment-icon');
		setIcon(this.icon, 'message-square');

		// DEBUG: Add line under icon to check alignment of comment gutter element with widget
		// const line = document.createElement('div');
		// line.classList.add('criticmarkup-debug-comment-line');
		// this.icon.appendChild(line);

		if (this.is_block) {
			this.icon.onclick = (e) => {
				const gutterElements = view.state.field(commentGutterMarkers);
				e.preventDefault();
				gutterElements.between(this.node.from, this.node.to, (from, to, widget) => {
					if (this.node.equals(widget.node)) {
						widget.comment!.dispatchEvent(new MouseEvent('dblclick'));
						return false;
					}
				});
			};
		} else {
			if (this.node.length) {
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
