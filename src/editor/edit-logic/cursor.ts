import { CriticMarkupRange } from '../../types';
import { CriticMarkupNodes } from '../criticmarkup-nodes';
import { EditorSelection, EditorState, Text } from '@codemirror/state';

export function cursor_move(range: CriticMarkupRange, nodes: CriticMarkupNodes, doc: Text, state: EditorState,
							backwards_select: boolean, group_select: boolean, is_selection: boolean) {
	const node = nodes.at_cursor(range.to);
	if (!node) {
		// TODO: Implement selection logic
		if (backwards_select)
			[range.from, range.to] = [range.to, range.from];
		return {selection: EditorSelection.range(range.from, range.to)};
	}

	if (range.from < node.from + 3) {
		const adjacent_node = nodes.adjacent_to_node(node, true, true);

		if (backwards_select) {
			if (adjacent_node)
				range.from = Math.max(adjacent_node.to - 4, adjacent_node.from + 3);
			else
				range.from = Math.max(node.from - 1, 0);
		} else {
			range.from = Math.min(node.from + 4, node.to - 3);
		}

		if (!is_selection)
			range.to = range.from;
	}

	if (range.to > node.to - 3) {
		const adjacent_node = nodes.adjacent_to_node(node, false, true);


		if (!backwards_select) {
			if (adjacent_node)
				range.to = Math.min(adjacent_node.from + 4, adjacent_node.to - 3);
			else
				range.to = Math.min(node.to + 1, doc.length);
		} else {
			range.to = Math.max(node.to - 4, node.from + 3);
		}

		if (!is_selection)
			range.from = range.to;
	}

	return {selection: EditorSelection.range(range.from, range.to)};



}
