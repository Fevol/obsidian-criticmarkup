import { EditorState, StateField } from '@codemirror/state';
import { type ChangedRange, type SyntaxNode, type Tree, TreeFragment } from '@lezer/common';
import {Interval, Node} from "@flatten-js/interval-tree";

import {
	CriticMarkupRange, CriticMarkupRanges,
	AdditionRange, CommentRange, DeletionRange, HighlightRange, SubstitutionRange, SuggestionType,
} from '../ranges';

import { criticmarkupLanguage } from '../parser';

export const rangeParser: StateField<{tree: Tree, fragments: readonly TreeFragment[], ranges: CriticMarkupRanges}> = StateField.define({
	create(state) {
		const text = state.doc.toString();
		const tree = criticmarkupLanguage.parser.parse(text);

		return {
			tree,
			fragments: TreeFragment.addTree(tree),
			ranges: new CriticMarkupRanges(cursorGenerateRanges(tree, text))
		}
	},

	// @ts-ignore (Not sure how to set fragments as readonly)
	update(value, tr) {
		if (!tr.docChanged) return value;

		// Below times are based on stresstest (250.000 words, 56.167 ranges)
		// get-changes: 0.01 - 0.05 ms
		const changed_ranges: ChangedRange[] = [];
		tr.changes.iterChangedRanges((from, to, fromB, toB) =>
			changed_ranges.push({fromA: from, toA: to, fromB: fromB, toB: toB})
		);

		// fragment-update: 0.01 - 0.08 ms
		let fragments = TreeFragment.applyChanges(value.fragments, changed_ranges);
		// stringify-doc: 0.98 - 8.99 ms
		const text = tr.state.doc.toString();
		// parse-doc: 2.75 - 3.37 ms
		const tree = criticmarkupLanguage.parser.parse(text, fragments);
		// apply-fragments: <0.01 ms
		fragments = TreeFragment.addTree(tree, fragments);

		// regenerate-ranges: 0.20 - 0.55 ms
		const new_nodes = [];
		const offsets: [number, number][] = [];
		for (const range of changed_ranges) {
			value.ranges.tree
				.search([range.fromA, range.toA], (node: CriticMarkupRange, key: Interval) => {
					value.ranges.tree.remove(key, node);
					return true;
				});

			new_nodes.push(...cursorGenerateRanges(tree, text, range.fromB, range.toB));
			offsets.push([range.toA, range.toB - range.fromB - (range.toA - range.fromA)]);
		}

		let cumulative_offset = 0;

		// apply-offsets: 7.00 - 9.89 ms
		value.ranges.tree.tree_walk(value.ranges.tree.root!, (node: Node<CriticMarkupRange>) => {
			while (offsets.length && node.item.key.low >= offsets[0][0])
				cumulative_offset += offsets.shift()![1];
			if (cumulative_offset) {
				node.item.value.apply_offset(cumulative_offset);
				node.item.key = new Interval(node.item.value.from, node.item.value.to);
				node.update_max();
			}
		});

		// insert-new-ranges: <0.01 - 0.05 ms
		for (const range of new_nodes)
			value.ranges.tree.insert([range.from, range.to], range);

		// finalize: 1.80 - 1.85 ms
		value.ranges.ranges = value.ranges.tree.values;

		return { tree, ranges: value.ranges, fragments }
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

export function cursorGenerateRanges(tree: Tree, text: string, start = 0, to = text.length) {
	const ranges: CriticMarkupRange[] = [];

	let previous_regular_range: CriticMarkupRange | undefined = undefined;
	let previous_range: CriticMarkupRange | undefined = undefined;

	const cursor = tree.cursor();
	// Move into first range if it exists (otherwise stays in CriticMarkup node), negative offset to be left-inclusive
	cursor.childAfter(start - 1);
	if (cursor.node.type.name === "CriticMarkup")
		return ranges;
	if (cursor.node.from > to)
		return ranges;

	if (cursor) {
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
		} while (cursor.nextSibling() && cursor.node.from <= to)
	}

	return ranges;
}


export function selectionContainsRanges(state: EditorState) {
	const ranges = state.field(rangeParser).ranges;
	return ranges.ranges.length ? state.selection.ranges.some(range =>
		ranges.contains_range(range.from, range.to),
	) : false;
}

export function getRangesInText(text: string) {
	const tree = criticmarkupLanguage.parser.parse(text);
	return cursorGenerateRanges(tree, text);
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
