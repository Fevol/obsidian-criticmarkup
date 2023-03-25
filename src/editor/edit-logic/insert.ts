import type { CriticMarkupNodes, CriticMarkupRange, EditorChange, OperationReturn } from '../../types';
import { EditorSelection, SelectionRange } from '@codemirror/state';

export function text_insert(range: CriticMarkupRange, nodes: CriticMarkupNodes, offset: number): OperationReturn {
	const node = nodes.at_cursor(range.to);
	offset += range.offset.added;
	const changes: EditorChange[] = [];
	let selection: SelectionRange;

	if (!node) {
		const left_adjacent_node = nodes.adjacent_to_cursor(range.from, true);
		const right_adjacent_node = nodes.adjacent_to_cursor(range.to, false);

		let replacement_start: number;
		let node_offset = 0;
		if (left_adjacent_node && left_adjacent_node.type === 'Addition' && left_adjacent_node.to === range.from) {
			replacement_start = left_adjacent_node.to - 3;
		} else if (right_adjacent_node && right_adjacent_node.type === 'Addition' && right_adjacent_node.from === range.to) {
			replacement_start = right_adjacent_node.from + 3;
		} else {
			replacement_start = range.to;
			range.inserted = `{++${range.inserted}++}`;
			offset += 6;
			node_offset -= 3;
		}

		changes.push({
			from: replacement_start,
			to: replacement_start,
			insert: range.inserted,
		});
		selection = EditorSelection.cursor(replacement_start + node_offset + offset);

	} else {
		if (node.type !== 'Addition' && (range.to === node.from || range.from === node.to)) {
			range.inserted = `{++${range.inserted}++}`;

			const insert_start = range.to === node.from ? node.from : node.to;
			offset += 6;
			changes.push({
				from: insert_start,
				to: insert_start,
				insert: range.inserted,
			});
			selection = EditorSelection.cursor(insert_start + offset - 3);
		} else {
			if (range.from < node.from + 3) {
				range.from = node.from + 3;
				range.to = range.from;
			} else if (range.to > node.to - 3) {
				range.to = node.to - 3;
				range.from = range.to;
			}

			changes.push({
				from: range.from,
				to: range.to,
				insert: range.inserted,
			});
			selection = EditorSelection.cursor(range.to + offset);
		}
	}

	return { changes, selection, offset }
}
