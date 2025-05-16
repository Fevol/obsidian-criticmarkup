import { EditorState, StateField } from "@codemirror/state";
import { Interval, Node } from "@flatten-js/interval-tree";
import { type ChangedRange, type SyntaxNode, type Tree, TreeFragment } from "@lezer/common";

import {
	AdditionRange,
	CommentRange,
	CriticMarkupRange,
	CriticMarkupRanges,
	DeletionRange,
	HighlightRange,
	SubstitutionRange,
	SuggestionType,
} from "../ranges";

import { DocInput } from "@codemirror/language";
import { COMMENTATOR_GLOBAL } from "../../../global";
import { fullReloadEffect } from "../../settings";
import { criticmarkupLanguage } from "../parser";

interface ParserData {
	tree: Tree;
	fragments: readonly TreeFragment[];
	ranges: CriticMarkupRanges;
	inserted_ranges: CriticMarkupRange[];
	deleted_ranges: CriticMarkupRange[];
}

export const rangeParser: StateField<ParserData> = StateField.define({
	create(state) {
		const text = state.doc.toString();
		const tree = criticmarkupLanguage.parser.parse(text);
		const ranges = new CriticMarkupRanges(cursorGenerateRanges(tree, text));
		return {
			tree,
			fragments: TreeFragment.addTree(tree),
			ranges: ranges,
			inserted_ranges: ranges.ranges,
			deleted_ranges: [],
		};
	},

	update(value: ParserData, tr) {
		if (tr.effects.some(effect => effect.is(fullReloadEffect)))
			return this.create(tr.state) as ParserData;

		if (!tr.docChanged)
			return value;

		// The below times are based on stress-test (250.000 words, 56.167 ranges)
		// get-changes: 0.01 - 0.05 ms
		const changed_ranges: ChangedRange[] = [];
		tr.changes.iterChangedRanges((from, to, fromB, toB) =>
			changed_ranges.push({ fromA: from, toA: to, fromB: fromB, toB: toB })
		);

		// fragment-update: 0.01 - 0.08 ms
		let fragments = TreeFragment.applyChanges(value.fragments, changed_ranges);
		// stringify-doc: 0.98 - 8.99 ms
		const text = tr.state.doc.toString();
		// parse-doc: 0.68 - 1.24 ms
		const tree = criticmarkupLanguage.parser.parse(new DocInput(tr.state.doc), fragments);
		// apply-fragments: <0.01 ms
		fragments = TreeFragment.addTree(tree, fragments);

		// regenerate-ranges: 0.20 - 0.55 ms
		const inserted_set = new Map<number, CriticMarkupRange>();
		const offsets: [number, number][] = [];
		const dangling_comments = new Map<number, CommentRange>();
		const deleted_ranges: Set<CriticMarkupRange> = new Set();
		for (const changed_range of changed_ranges) {
			value.ranges.tree
				.search([changed_range.fromA, changed_range.toA], (range: CriticMarkupRange, key: Interval) => {
					value.ranges.tree.remove(key, range);
					deleted_ranges.add(range);
					for (const reply of range.base_range.thread)
						dangling_comments.set(reply.from, reply);
					return true;
				});

			for (const range of cursorGenerateRanges(tree, text, changed_range.fromB, changed_range.toB))
				inserted_set.set(range.from, range);
			offsets.push([
				changed_range.toA,
				changed_range.toB - changed_range.fromB - (changed_range.toA - changed_range.fromA),
			]);
		}
		for (const deleted_range of deleted_ranges) {
			if (deleted_range.type === SuggestionType.COMMENT)
				dangling_comments.delete(deleted_range.from);
		}

		let cumulative_offset = 0;

		// apply-offsets: 2.72-3.70 ms
		const nil_node = value.ranges.tree.nil_node;
		function visitNode(node: Node<CriticMarkupRange>) {
			if (node != null && node != nil_node) {
				visitNode(node.left);
				while (offsets.length && node.item.key.low >= offsets[0][0])
					cumulative_offset += offsets.shift()![1];
				node.item.value.apply_offset(cumulative_offset);
				node.item.key.low = node.item.value.from;
				node.item.key.high = node.item.value.to;
				visitNode(node.right);
				if (node.left != nil_node)
					node.max.low = node.left.max.low;
				if (node.right != nil_node)
					node.max.high = node.right.max.high;
			}
		}
		visitNode(value.ranges.tree.root!);
		const inserted_ranges = Array.from(inserted_set.values());

		// insert-new-ranges: <0.01 - 0.05 ms
		for (const range of inserted_ranges)
			value.ranges.tree.insert([range.from, range.to], range);

		// comments-thread-reconstruction: <0.01 - 0.05 ms
		for (const range of inserted_ranges) {
			if (range.type === SuggestionType.COMMENT)
				dangling_comments.set(range.from, range as CommentRange);
		}

		// FIXME: Rare cases of comment ranges in threads being duplicated due to editor changes
		if (dangling_comments.size) {
			const comment_threads: CommentRange[][] = [];
			let last_range: CommentRange | undefined = undefined;
			let current_thread: CommentRange[] = [];
			for (const range of Array.from(dangling_comments.values()).sort((a, b) => a.from - b.from)) {
				range.clear_references();
				range.replies.length = 0;

				if (!last_range || last_range?.right_adjacent(range))
					current_thread.push(range);
				else {
					comment_threads.push(current_thread);
					current_thread = [range];
				}
				last_range = range;
			}
			comment_threads.push(current_thread);

			for (const thread of comment_threads) {
				const head = thread[0];
				const adjacent_range = value.ranges.tree.search([head.from, head.from])[0] as CriticMarkupRange;
				adjacent_range!.replies.length = 0;
				for (const comment of thread.slice(adjacent_range === head ? 1 : 0))
					comment.add_reply(adjacent_range);
			}
		}

		// finalize: 1.80 - 1.85 ms
		value.ranges.ranges = value.ranges.tree.values;

		return { tree, ranges: value.ranges, fragments, inserted_ranges, deleted_ranges: [...deleted_ranges] };
	},
});

function constructRangeFromSyntaxNode(range: SyntaxNode, text: string) {
	const metadata =
		(COMMENTATOR_GLOBAL.PLUGIN_SETTINGS.enable_metadata && range.firstChild?.type.name.startsWith("MDSep")) ?
			range.firstChild!.from :
			undefined;
	let middle = undefined;
	if (range.type.name === "Substitution") {
		const child = metadata ? range.firstChild?.nextSibling : range.firstChild;
		if (!child || child.type.name !== "MSub") return;
		middle = child.from;
	}

	return constructRange(range.from, range.to, range.type.name, text.slice(range.from, range.to), middle, metadata);
}

export function cursorGenerateRanges(tree: Tree, text: string, start = 0, to = text.length) {
	const ranges: CriticMarkupRange[] = [];

	let previous_range: CriticMarkupRange | undefined = undefined;

	const cursor = tree.cursor();
	// Move into the first range if it exists (otherwise stays in CriticMarkup node), negative offset to be left-inclusive
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
			if (new_range) {
				if (
					new_range.type === SuggestionType.COMMENT && previous_range &&
					previous_range.right_adjacent(new_range)
				) {
					(new_range as CommentRange).add_reply(previous_range);
				}
				ranges.push(new_range);
				previous_range = new_range;
			}
		} while (cursor.nextSibling() && cursor.node.from <= to);
	}

	return ranges;
}

export function selectionContainsRanges(state: EditorState) {
	const ranges = state.field(rangeParser).ranges;
	return ranges.ranges.length ?
		state.selection.ranges.some(range => ranges.contains_range(range.from, range.to)) :
		false;
}

export function getRangesInText(text: string) {
	const tree = criticmarkupLanguage.parser.parse(text);
	return cursorGenerateRanges(tree, text);
}

export function constructRange(
	from: number,
	to: number,
	type: string,
	text: string,
	middle?: number,
	metadata?: number,
) {
	switch (type) {
		case "Addition":
			return new AdditionRange(from, to, text, metadata);
		case "Deletion":
			return new DeletionRange(from, to, text, metadata);
		case "Substitution":
			return new SubstitutionRange(from, middle!, to, text, metadata);
		case "Highlight":
			return new HighlightRange(from, to, text, metadata);
		case "Comment":
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
