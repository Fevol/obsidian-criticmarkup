import { CriticMarkupRange } from "../base_range";
import { SuggestionType } from "../definitions";

export class HighlightRange extends CriticMarkupRange {
	constructor(from: number, to: number, text: string, metadata?: number) {
		super(from, to, SuggestionType.HIGHLIGHT, "Highlight", text, metadata);
	}
}
