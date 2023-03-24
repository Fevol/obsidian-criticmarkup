import type { CriticMarkupNode, CriticMarkupRange, EditorChange, OperationReturn } from '../../types';
import { adjacentCursorNode, nodeAtCursorLocation } from '../editor-util';
import { EditorSelection, SelectionRange } from '@codemirror/state';

export function text_insert(range: CriticMarkupRange, nodes: CriticMarkupNode[], offset: number): OperationReturn {
	const node = nodeAtCursorLocation(nodes, range.to);
	offset += range.offset.added;

	const changes: EditorChange[] = [];
	let selection: SelectionRange;

	if (!node) {
		const left_adjacent_node = adjacentCursorNode(nodes, range.from, true);
		const right_adjacent_node = adjacentCursorNode(nodes, range.to, false);

		let replacement_start: number;
		let node_offset = range.offset.added;
		if (left_adjacent_node && left_adjacent_node.to === range.from) {
			replacement_start = left_adjacent_node.to - 3;
		} else if (right_adjacent_node && right_adjacent_node.from === range.to) {
			replacement_start = right_adjacent_node.from + 3;
		} else {
			replacement_start = range.to;
			range.inserted = `{++${range.inserted}++}`;
			node_offset += 6;
			node_offset -= 3;
		}

		changes.push({
			from: replacement_start,
			to: replacement_start,
			insert: range.inserted,
		});
		selection = EditorSelection.cursor(replacement_start + node_offset + offset);

	} else {
		if (range.from < node.from + 3) {
			range.from = node.from + 3;
			range.to = range.from;
		}
		else if (range.to > node.to - 3) {
			range.to = node.to - 3;
			range.from = range.to;
		}

		changes.push({
			from: range.from,
			to: range.to,
			insert: range.inserted,
		});
		selection = EditorSelection.cursor(range.to + range.offset.added + offset);
	}

	return { changes, selection, offset }
}
