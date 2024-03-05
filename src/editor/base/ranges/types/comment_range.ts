import {CM_All_Brackets, SuggestionType} from '../definitions';
import { CriticMarkupRange } from '../base_range';
import {PreviewMode} from "../../../../types";

import {Component, MarkdownRenderer, setIcon} from "obsidian";

export class CommentRange extends CriticMarkupRange {
	reply_depth = 0;
	attached_comment: CriticMarkupRange | null = null;

	get base_range(): CriticMarkupRange {
		return this.attached_comment || this;
	}

	get thread(): CommentRange[] {
		return this.attached_comment ? [...this.attached_comment.thread] : [this, ...this.replies];
	}

	clear_references() {
		this.attached_comment = null;
		this.reply_depth = 0;
	}

	add_reply(range: CriticMarkupRange) {
		this.attach_to_range(range.type === SuggestionType.COMMENT ? (range as CommentRange).base_range : range);
	}

	attach_to_range(range: CriticMarkupRange) {
		range.replies.push(this);
		this.reply_depth = range.replies.length - (range.type === SuggestionType.COMMENT ? 0 : 1);
		this.attached_comment = range;
	}

	postprocess(unwrap: boolean = true, previewMode: PreviewMode = PreviewMode.ALL, tag: keyof HTMLElementTagNameMap = 'div', left: boolean | null = null, text?: string) {
		let str = text ?? this.text;
		if (!text && unwrap) {
			if (this.to >= str.length && !str.endsWith(CM_All_Brackets[this.type].at(-1)!))
				str = this.unwrap_bracket(true);
			else
				str = this.unwrap();
		}

		const icon = document.createElement('span');
		icon.classList.add('criticmarkup-comment-icon');
		setIcon(icon, 'message-square');
		let tooltip: HTMLElement | null = null;
		let component = new Component();
		icon.onmouseenter = () => {
			if (tooltip) return;

			tooltip = document.createElement('div');
			tooltip.classList.add('criticmarkup-comment-tooltip');
			MarkdownRenderer.render(app, str, tooltip, '', component);
			component.load();
			icon!.appendChild(tooltip);

			// Set tooltip position
			const icon_rect = icon!.getBoundingClientRect();
			const tooltip_rect = tooltip.getBoundingClientRect();
			tooltip.style.left = icon_rect.x - tooltip_rect.x  + 12 + "px";
		}

		icon.onmouseleave = () => {
			if (tooltip) {
				component.unload();
				icon!.removeChild(tooltip!);
				tooltip = null;
			}
		}


		return icon;
	}

	constructor(from: number, to: number, text: string, metadata?: number) {
		super(from, to, SuggestionType.COMMENT, 'Comment', text, metadata);
	}
}

