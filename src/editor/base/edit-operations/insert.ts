import { EditorSelection, SelectionRange } from '@codemirror/state';

import { type CriticMarkupEdit, type EditorChange, type OperationReturn } from './types';

import { CriticMarkupNode, CriticMarkupNodes, SubstitutionNode, NodeType } from '../nodes';


function insert_new_node(insertion_start: number, offset: number, node_offset: number, range: CriticMarkupEdit, nodes: CriticMarkupNodes, node: CriticMarkupNode, left: boolean) {
	// Check for existence of adjacent node to which text may be added
	const adjacent_node = nodes.adjacent_to_node(node, left, true);
	if (adjacent_node && (adjacent_node.type === NodeType.ADDITION || (left && adjacent_node.type === NodeType.SUBSTITUTION))) {
		insertion_start = left ? adjacent_node.to - 3 : adjacent_node.from + 3;
	} else {
		insertion_start = left ? node.from : node.to;
		range.inserted = `{++${range.inserted}++}`;
		offset += 6;
		node_offset -= 3;
	}
	return { insertion_start, offset, node_offset };
}


export function text_insert(range: CriticMarkupEdit, nodes: CriticMarkupNodes, offset: number): OperationReturn {
	const node = nodes.at_cursor(range.to);
	offset += range.offset.added;
	const changes: EditorChange[] = [];

	let node_offset = 0;
	let insertion_start = range.from;
	if (!node) {
		range.inserted = `{++${range.inserted}++}`;
		offset += 6;
		node_offset -= 3;
	} else {
		if (node.type === NodeType.SUBSTITUTION) {
			if (node.touches_left_bracket(range.to, true, true)) {
				({ insertion_start, offset, node_offset } = insert_new_node(insertion_start, offset, node_offset, range, nodes, node, true));
			} else if (node.touches_separator(range.to, false, true)) {
				insertion_start = (<SubstitutionNode>node).middle;
			} else if (node.touches_right_bracket(range.to)) {
				insertion_start = node.to - 3;
			}
		} else if (node.type === NodeType.ADDITION) {
			if (node.touches_left_bracket(range.from)) {
				insertion_start = node.from + 3;
			} else if (node.touches_right_bracket(range.to)) {
				insertion_start = node.to - 3;
			}
		} else {
			if (node.touches_left_bracket(range.from)) {
				({ insertion_start, offset, node_offset } = insert_new_node(insertion_start, offset, node_offset, range, nodes, node, true));
			} else if (node.touches_right_bracket(range.to)) {
				({ insertion_start, offset, node_offset } = insert_new_node(insertion_start, offset, node_offset, range, nodes, node, false));
			}
		}
	}
	changes.push({ from: insertion_start, to: insertion_start, insert: range.inserted });
	const selection: SelectionRange = EditorSelection.cursor(insertion_start + node_offset + offset);

	return { changes, selection, offset };
}
