import { CriticMarkupRange } from "../base_range";
import { SuggestionType } from "../definitions";

export class CommentRange extends CriticMarkupRange {
	reply_depth = 0;
	attached_comment: CriticMarkupRange | null = null;

	get base_range(): CriticMarkupRange {
		return this.attached_comment || this;
	}

	get thread(): CommentRange[] {
		return this.attached_comment ? [...this.attached_comment.thread] : [this, ...this.replies];
	}

	accept(removeComments: boolean = true): string {
		if (removeComments) {
			return "";
		} else {
			return this.unwrap();
		}
	}

	reject(removeComments: boolean = true): string {
		if (removeComments) {
			return "";
		} else {
			return this.unwrap();
		}
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

	constructor(from: number, to: number, text: string, metadata?: number) {
		super(from, to, SuggestionType.COMMENT, "Comment", text, metadata);
	}
}
