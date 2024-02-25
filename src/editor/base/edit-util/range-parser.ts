import { EditorState, StateField } from '@codemirror/state';
import { type ChangedRange, type SyntaxNode, type Tree, TreeFragment } from '@lezer/common';

import {
	CriticMarkupRange, CriticMarkupRanges,
	AdditionRange, CommentRange, DeletionRange, HighlightRange, SubstitutionRange, SuggestionType,
} from '../ranges';

import { criticmarkupLanguage } from '../parser';

export const rangeParser: StateField<{tree: Tree, fragments: readonly TreeFragment[], ranges: CriticMarkupRanges}> = StateField.define({
	create(state) {
		const text = state.doc.toString();
		const tree = criticmarkupLanguage.parser.parse(text);
		const fragments = TreeFragment.addTree(tree);
		const ranges = rangesInText(tree, text);

		return { tree, ranges, fragments }
	},

	// @ts-ignore (Not sure how to set fragments as readonly)
	update(value, tr) {
		if (!tr.docChanged) return value;

		const changed_ranges: ChangedRange[] = [];
		tr.changes.iterChangedRanges((from, to, fromB, toB) =>
			changed_ranges.push({fromA: from, toA: to, fromB: fromB, toB: toB})
		);

		let fragments = TreeFragment.applyChanges(value.fragments, changed_ranges);
		const text = tr.state.doc.toString();
		const tree = criticmarkupLanguage.parser.parse(text, fragments);
		fragments = TreeFragment.addTree(tree, fragments);
		const ranges = rangesInText(tree, text);


		return { tree, ranges, fragments }
	},
});


function constructRangeFromSyntaxNode(range: SyntaxNode, text: string) {
	const metadata = range.firstChild?.type.name.startsWith('MDSep') ? range.firstChild!.from : undefined;
	let middle = undefined;
	if (range.type.name === 'Substitution') {
		const child = (metadata ? range.firstChild?.nextSibling : range.firstChild);
		if (!child || child.type.name !== "MSub") return;
		middle = child.from;
	}

	return constructRange(range.from, range.to, range.type.name, text.slice(range.from, range.to), middle, metadata);
}

export function rangesInText(tree: Tree, text: string) {
	const ranges: CriticMarkupRange[] = [];

	let previous_regular_range: CriticMarkupRange | undefined = undefined;
	let previous_range: CriticMarkupRange | undefined = undefined;

	// Skip CriticMarkup root range
	const cursor = tree.cursor();
	if (cursor.next(true)) {
		do {
			const range = cursor.node;
			if (range.type.name === "⚠") continue;
			const new_range = constructRangeFromSyntaxNode(range, text);
			let is_reply = false;
			if (new_range) {
				if (new_range.type === SuggestionType.COMMENT && previous_range && previous_range.right_adjacent(new_range)) {
					(new_range as CommentRange).attach_to_range(previous_regular_range!)
					is_reply = true;
				}
				ranges.push(new_range);
				if (!is_reply)
					previous_regular_range = new_range;
				previous_range = new_range;
			}
		} while (cursor.nextSibling())
	}

	return new CriticMarkupRanges(ranges);
}

export function selectionContainsRanges(state: EditorState) {
	const ranges = state.field(rangeParser).ranges;
	return ranges.ranges.length ? state.selection.ranges.some(range =>
		ranges.contains_range(range.from, range.to),
	) : false;
}

export function getRangesInText(text: string) {
	const tree = criticmarkupLanguage.parser.parse(text);
	return rangesInText(tree, text);
}

export function constructRange(from: number, to: number, type: string, text: string, middle?: number, metadata?: number) {
	switch (type) {
		case 'Addition':
			return new AdditionRange(from, to, text, metadata);
		case 'Deletion':
			return new DeletionRange(from, to, text, metadata);
		case 'Substitution':
			return new SubstitutionRange(from, middle!, to, text, metadata);
		case 'Highlight':
			return new HighlightRange(from, to, text, metadata);
		case 'Comment':
			return new CommentRange(from, to, text, metadata);
		default:
			// Will never get called
			return new AdditionRange(from, to, text, metadata);
	}
}

export const RANGE_PROTOTYPE_MAPPER = {
	[SuggestionType.ADDITION]: AdditionRange,
	[SuggestionType.DELETION]: DeletionRange,
	[SuggestionType.HIGHLIGHT]: HighlightRange,
	[SuggestionType.SUBSTITUTION]: SubstitutionRange,
	[SuggestionType.COMMENT]: CommentRange,
};
