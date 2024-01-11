import { SuggestionType } from '../definitions';
import { CriticMarkupRange } from '../base_range';

export class HighlightRange extends CriticMarkupRange {
	constructor(from: number, to: number, text: string, metadata?: number) {
		super(from, to, SuggestionType.HIGHLIGHT, 'Highlight', text, metadata);
	}
}
