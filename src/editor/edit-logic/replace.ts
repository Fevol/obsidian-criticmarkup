import { CriticMarkupOperation, EditorChange, NodeType, OperationReturn } from '../../types';
import { CriticMarkupNodes, SubstitutionNode } from '../criticmarkup-nodes';
import { EditorSelection, Text } from '@codemirror/state';
import { CM_All_Brackets } from '../../util';

export function text_replace(range: CriticMarkupOperation, nodes: CriticMarkupNodes, offset: number, doc: Text): OperationReturn {
	const changes: EditorChange[] = [];
	let cursor_offset = 0;
	let deletion_start = range.from;
	let deletion_end = range.to;
	let anchor_deletion_end = null;

	const encountered_nodes = nodes.filter_range(deletion_start, deletion_end, true);
	let left_node = encountered_nodes.at_cursor(deletion_start),
		right_node = encountered_nodes.at_cursor(deletion_end, false, true);

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
			if (left_node.type === NodeType.DELETION) {
				deletion_start = left_node.from;
				left_node = undefined;
			} else if (left_node.type === NodeType.SUBSTITUTION && deletion_start >= (left_node as SubstitutionNode).middle) {
				deletion_start = left_node.from;
				left_node = undefined;
			}
		}
	}

	if (right_node) {
		if (deletion_end !== right_node.from)
			deletion_end = right_node.cursor_move_outside(deletion_end, false/*, right_node.type === NodeType.DELETION*/);

		if (deletion_end === right_node.to) {
			const right_adjacent_node = nodes.adjacent_to_node(right_node, false, true);
			if (right_adjacent_node?.type === NodeType.ADDITION)
				right_node = right_adjacent_node;
			else right_node = undefined;
		}

		if (right_node) {
			if (right_node.type === NodeType.ADDITION) {
				anchor_deletion_end = Math.max(right_node.from + 3, deletion_end);
				deletion_end = right_node.to;
				right_node = undefined;
			} else if (deletion_end === right_node.from) {
				right_node = undefined;
			} else if (right_node.type === NodeType.SUBSTITUTION && deletion_end >= (right_node as SubstitutionNode).middle) {
				// Note: can be separated below (might reduce risks of errors), but this is good enough imho
				anchor_deletion_end = deletion_end;
				deletion_end = right_node.to;
				right_node = undefined;
			}
		}
	}

	let deleted_text = nodes.unwrap_in_range(doc, deletion_start, deletion_end).output;
	let inserted_text = range.inserted;

	if (anchor_deletion_end) {
		const offset = deletion_end - anchor_deletion_end - 3;
		inserted_text += deleted_text.slice(deleted_text.length - offset);
		deleted_text = deleted_text.slice(0, deleted_text.length - offset);
	}

	let final_string = "";

	if (!left_node) {
		final_string += CM_All_Brackets[NodeType.SUBSTITUTION][0];
	} else {
		if (left_node.type === NodeType.SUBSTITUTION) {
			if (deletion_start >= (left_node as SubstitutionNode).middle) {
				final_string += CM_All_Brackets[NodeType.SUBSTITUTION][0];
			}
		} else {
			final_string += CM_All_Brackets[left_node.type][1];
			final_string += CM_All_Brackets[NodeType.SUBSTITUTION][0];
		}
	}

	final_string += deleted_text;
	final_string += CM_All_Brackets[NodeType.SUBSTITUTION][1];

	final_string += inserted_text;

	if (right_node?.type !== NodeType.ADDITION)
		final_string += CM_All_Brackets[NodeType.SUBSTITUTION][2];
	if (right_node && right_node.type !== NodeType.ADDITION) {
		final_string += CM_All_Brackets[right_node.type][0];
		cursor_offset -= 3;
		if (right_node.type === NodeType.SUBSTITUTION && deletion_end >= (right_node as SubstitutionNode).middle) {
			final_string += CM_All_Brackets[NodeType.SUBSTITUTION][1];
			cursor_offset -= 2;
		}
	}

	changes.push({ from: deletion_start, to: deletion_end, insert: final_string });

	const removed_chars = (deletion_end - deletion_start) - deleted_text.length;
	const added_chars = final_string.length - (deleted_text.length + inserted_text.length);

	offset += added_chars - removed_chars + range.inserted.length;
	cursor_offset -= 3;

	const selection = EditorSelection.cursor(deletion_end + cursor_offset + offset);

	return { changes, selection, offset }
}
