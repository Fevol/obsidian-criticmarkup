import { Text, EditorSelection, EditorState } from '@codemirror/state';
import { EditorChange, OperationReturn, CriticMarkupOperation, NodeType } from '../../types';

import { CriticMarkupNodes, SubstitutionNode } from '../criticmarkup-nodes';
import { cursor_move } from '.';

import { CM_All_Brackets } from '../../util';
import { findBlockingChar } from '../editor-util';


export function text_delete(range: CriticMarkupOperation, nodes: CriticMarkupNodes, offset: number, doc: Text,
							backwards_delete: boolean, group_delete: boolean, selection_delete: boolean, state: EditorState): OperationReturn {
	// FIXME: Efficiency: Reduce if statement complexity (redundant if checks, deep nesting)
	// TODO: Readability: Better commenting
	// FIXME: Efficiency: nodes.XXX operations are pretty expensive, B+tree or smarter usage

	const changes: EditorChange[] = [];

	let cursor_offset = 0;
	let deletion_start = range.from;
	let deletion_end = range.to;
	let deletion_cursor: number;

	// Iff cursor delete: find cursor position of delete as if CM syntax does not exist
	if (!selection_delete) {
		const deletion_anchor = !backwards_delete ? deletion_start : deletion_end;
		const deletion_head = group_delete ? findBlockingChar(deletion_anchor, !backwards_delete, state)[0]
			: deletion_anchor + (backwards_delete ? -1 : 1);

		const orig_sel = { from: 0, to: 0, head: deletion_anchor, anchor: deletion_anchor };
		const new_sel = { from: 0, to: 0, head: deletion_head, anchor: deletion_head };

		const cursor = cursor_move(new_sel, orig_sel,
			nodes, state, backwards_delete, group_delete, selection_delete, false);

		if (backwards_delete) deletion_start = cursor.selection.head;
		else deletion_end = cursor.selection.head;
	}

	const encountered_nodes = nodes.filter_range(deletion_start, deletion_end, true);
	const inside_node = encountered_nodes.nodes.length === 1 && encountered_nodes.nodes[0].encloses_range(deletion_start, deletion_end);

	// For efficiency, no need to re-construct nodes if deletion is cursor movement operation (inside DEL or left part of SUB)
	if (inside_node && (encountered_nodes.nodes[0].type === NodeType.DELETION ||
		(encountered_nodes.nodes[0].type === NodeType.SUBSTITUTION && encountered_nodes.nodes[0].part_encloses_range(deletion_start, deletion_end, true))
	)) {
		deletion_cursor = backwards_delete ? deletion_start : deletion_end;
	} else {
		let left_node = encountered_nodes.at_cursor(deletion_start),
			right_node = encountered_nodes.at_cursor(deletion_end, false, true);

		const original_deletion_start = deletion_start;
		let anchor_deletion_start = null;

		// Move deletion range to account for critic markup deletions
		if (left_node) {
			if (deletion_start !== left_node.to)
				deletion_start = left_node.cursor_move_outside(deletion_start, left_node.type !== NodeType.DELETION);

			if (deletion_start === left_node.from) {
				const left_adjacent_node = nodes.adjacent_to_node(left_node, true, true);
				if (left_adjacent_node && (left_adjacent_node.type === NodeType.DELETION))
					left_node = left_adjacent_node;
				else left_node = undefined;
			}

			if (left_node) {
				if (left_node.type === NodeType.DELETION && right_node?.type === NodeType.SUBSTITUTION
					&& deletion_start <= (right_node as SubstitutionNode).middle + 2) {
					anchor_deletion_start = left_node.to;
					deletion_start = left_node.from;
					left_node = undefined;
				} else if (left_node.type === NodeType.SUBSTITUTION && deletion_start <= (left_node as SubstitutionNode).middle) {
					anchor_deletion_start = deletion_start + 3;
					deletion_start = left_node.from;
					left_node = undefined;
				} else if (deletion_start === left_node.to) {
					if (left_node.type === NodeType.DELETION)
						deletion_start = left_node.to - 3;
					else left_node = undefined;
				}
			}
		}

		if (right_node) {
			if (deletion_end !== right_node.from)
				deletion_end = right_node.cursor_move_outside(deletion_end, right_node.type === NodeType.DELETION);

			if (deletion_end === right_node.to) {
				const right_adjacent_node = nodes.adjacent_to_node(right_node, false, true);
				if (right_adjacent_node && (right_adjacent_node.type === NodeType.DELETION || right_adjacent_node.type === NodeType.SUBSTITUTION))
					right_node = right_adjacent_node;
				else right_node = undefined;
			}

			if (right_node) {
				if (deletion_end === right_node.from) {
					if (right_node.type === NodeType.DELETION || right_node.type === NodeType.SUBSTITUTION)
						deletion_end = right_node.from + 3;
					else right_node = undefined;
				}
			}
		}

		// TODO: Optimize(?): Slowest part of the algorithm
		let encountered_text = nodes.unwrap_in_range(doc, deletion_start, deletion_end);

		let final_string = '';

		// Add in all brackets where necessary to form valid CM nodes
		// NOTE: Any place where left_node.type is ADDITION, it can also be HIGHLIGHT or COMMENT
		//		 Keep in mind: you might want different deletion behaviour (i.e. 'ignore' for comments)
		if (left_node) {
			if (left_node.type === NodeType.ADDITION || left_node.type === NodeType.HIGHLIGHT || left_node.type === NodeType.COMMENT)
				final_string += CM_All_Brackets[left_node.type][1];
			if (left_node.type === NodeType.SUBSTITUTION) {
				if (deletion_start <= (left_node as SubstitutionNode).middle)
					final_string += CM_All_Brackets[NodeType.SUBSTITUTION][1];
				final_string += CM_All_Brackets[NodeType.SUBSTITUTION][2];
			}
		}

		if (left_node?.type !== NodeType.DELETION && right_node?.type !== NodeType.SUBSTITUTION)
			final_string += CM_All_Brackets[NodeType.DELETION][0];
		if (right_node?.type === NodeType.SUBSTITUTION)
			final_string += CM_All_Brackets[NodeType.SUBSTITUTION][0];
		const left_added = final_string.length;

		final_string += encountered_text.output;

		if (!right_node || right_node.type === NodeType.ADDITION || right_node.type === NodeType.HIGHLIGHT || right_node.type === NodeType.COMMENT)
			final_string += CM_All_Brackets[NodeType.DELETION][1];

		if (right_node) {
			if (right_node.type === NodeType.ADDITION || right_node.type === NodeType.HIGHLIGHT || right_node.type === NodeType.COMMENT)
				final_string += CM_All_Brackets[right_node.type][0];
			if (right_node.type === NodeType.SUBSTITUTION && deletion_end >= (<SubstitutionNode>right_node).middle + 2)
				final_string += CM_All_Brackets[NodeType.SUBSTITUTION][1];
		}


		// Recompute cursor location based on added/removed brackets
		const right_added = final_string.length - encountered_text.output.length - left_added;
		const added_chars = left_added + right_added;
		const removed_chars = (deletion_end - deletion_start) - encountered_text.output.length;
		if (anchor_deletion_start !== null)
			cursor_offset -= 6;

		offset -= removed_chars - added_chars;
		cursor_offset += removed_chars - added_chars + left_added;

		changes.push({ from: deletion_start, to: deletion_end, insert: final_string });

		// Compute actual text characters that were moved into the node
		if (anchor_deletion_start)
			encountered_text = nodes.unwrap_in_range(doc, original_deletion_start, deletion_end);
		deletion_cursor = (anchor_deletion_start ?? deletion_start) + (backwards_delete ? 0 : encountered_text.output.length);
	}

	const selection = EditorSelection.cursor(deletion_cursor + cursor_offset + offset);

	return { changes, selection, offset };
}
