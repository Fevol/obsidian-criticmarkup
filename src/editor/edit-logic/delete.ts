import type { CriticMarkupNode, CriticMarkupRange, EditorChange, OperationReturn } from '../../types';
import { adjacentCursorNode, nodeAtCursorLocation, nodesInRange } from '../editor-util';
import { removeBrackets } from '../../util';
import { EditorSelection, SelectionRange } from '@codemirror/state';
import type { Text } from '@codemirror/state';

export function text_delete(range: CriticMarkupRange, nodes: CriticMarkupNode[], offset: number, doc: Text,
							backwards_delete: boolean, group_delete: boolean, selection_delete: boolean): OperationReturn {

	const nodes_in_range = nodesInRange(nodes, range.from, range.to);

	const changes: EditorChange[] = [];

	// Default to 0 in case something goes tremendously wrong
	let selection: SelectionRange = EditorSelection.cursor(0);


	// CASE 1: Deleting a selection
	if (selection_delete) {
		// TODO: Check whether addition nodes and substitution nodes should also be deleted like this
		// FIXME: Partially selected brackets will be fully removed too

		let content = removeBrackets(range.deleted!, nodes_in_range, range.from);
		if (nodes_in_range[0]?.from >= range.from)
			content = `{--` + content;
		if (nodes_in_range[nodes_in_range.length - 1]?.to <= range.to)
			content += `--}`;

		changes.push({
			from: range.from,
			to: range.to,
			insert: content,
		});
		selection = EditorSelection.cursor(backwards_delete ? range.from + offset : range.to + offset - 6 * (nodes_in_range.length - 1));
		offset -= 6 * (nodes_in_range.length - 1);
	}

	// CASE 2: Deleting via cursor
	else {
		const node = nodeAtCursorLocation(nodes_in_range, backwards_delete ? range.from : range.to);

		if (!node) {
			const is_start = !range.from;
			const is_end = range.to === doc.length - 1;
			let deleted_text = doc.sliceString(range.from + (is_start ? 0 : -1), range.to + (is_end ? 0 : 1));

			const left_adjacent_node = adjacentCursorNode(nodes, range.from, true);
			const right_adjacent_node = adjacentCursorNode(nodes, range.to, false);

			// TODO: Only matches a single space left/right

			const is_left_space = is_start || /\s/.test(deleted_text[0]) || !!left_adjacent_node && left_adjacent_node.to === range.from &&
				/\s/.test(doc.sliceString(range.from - 4, range.from - 3));
			const is_right_space = is_end || /\s/.test(deleted_text![deleted_text!.length - 1]);

			const is_right_punctuation = is_end || /\p{P}/u.test(deleted_text[deleted_text.length - 1]) &&
				!(right_adjacent_node && right_adjacent_node.from === range.to) &&
				!(left_adjacent_node && left_adjacent_node.to === range.from);

			const is_word_delete = is_left_space && is_right_space;
			const is_punctuation_delete = !is_word_delete && is_right_punctuation;

			deleted_text = deleted_text.slice(1 - +is_punctuation_delete || undefined, -1 + +is_word_delete || undefined);

			range.from -= +is_punctuation_delete;
			range.to += +is_word_delete;


			let selection_start = range.from;
			let selection_end = range.to;

			let keep_original_transaction = true;

			// CASE 1: Merge two Deletion nodes if they become next to each other
			if (left_adjacent_node?.type === 'Deletion' && right_adjacent_node?.type === 'Deletion'
				&& range.from === left_adjacent_node.to && range.to === right_adjacent_node.from) {
				selection_start = left_adjacent_node.to - 3;
				selection_end = right_adjacent_node.from + 3;
				keep_original_transaction = false;
				selection = EditorSelection.cursor(backwards_delete ? selection_start + offset : selection_start + deleted_text.length + offset);
				offset -= 6;
			}

			// CASE 2: Deleting character to the right of a Deletion node
			else if (left_adjacent_node?.type === 'Deletion' && range.from === left_adjacent_node.to) {
				selection_start = left_adjacent_node.to - 3;
				selection_end = selection_start;
				selection = EditorSelection.cursor(backwards_delete ? selection_start + offset : left_adjacent_node.to + deleted_text.length + offset);
			}

			// CASE 3: Deleting character to the left of a Deletion node
			else if (right_adjacent_node?.type === 'Deletion' && range.to === right_adjacent_node.from) {
				selection_start = right_adjacent_node.from + 3;
				selection_end = selection_start;
				selection = EditorSelection.cursor(backwards_delete ? range.from + offset : selection_start + offset);
			}

			// CASE 4: Deleting regular character outside node
			else {
				deleted_text = `{--${deleted_text}--}`;
				selection = EditorSelection.cursor(backwards_delete ? selection_start + offset : selection_end + offset + 6);
				offset += 6;
				keep_original_transaction = false;
			}

			if (keep_original_transaction) {
				changes.push({
					from: range.from,
					to: range.to,
					insert: '',
				});
			}

			changes.push({
				from: selection_start,
				to: selection_end,
				insert: deleted_text,
			});

		} else if (node && node.type === 'Deletion') {
			const in_brackets = range.from <= node.from + 3 || range.to >= node.to - 3;

			let cursor_location = 0;
			if (backwards_delete) {
				if (range.to === node.to) {
					if (group_delete)
						cursor_location = groupDelete(doc, node, nodes, range.from, range.to, backwards_delete)[0];
					else
						cursor_location = node.to - 4;
				} else {
					cursor_location = in_brackets ? node.from : range.from;
				}
			} else {
				if (range.from === node.from) {
					if (group_delete)
						cursor_location = groupDelete(doc, node, nodes, range.from, range.to, backwards_delete)[1];
					else
						cursor_location = node.from + 4;
				} else {
					cursor_location = in_brackets ? node.to : range.to;
				}
			}

			selection = EditorSelection.cursor(cursor_location + offset);
		} else if (node && node.type === 'Addition') {
			if (node.from + 3 === range.from && node.to - 3 === range.to) {
				changes.push({
					from: node.from,
					to: node.to,
					insert: '',
				});
				selection = EditorSelection.cursor(node.from + offset);
				offset -= 6;
			} else {
				changes.push({
					from: range.from,
					to: range.to,
					insert: '',
				});
				selection = EditorSelection.cursor(range.from + offset);
			}
		}
	}

	return { changes, selection, offset };
}


function groupDelete(doc: Text, node: CriticMarkupNode | undefined, nodes: CriticMarkupNode[],
					 from: number, to: number, backwards: boolean): [number, number] {
	if (node) {
		if (to >= node.to - 3 && backwards) {
			const text = doc.sliceString(node.from + 3, node.to - 3);
			const first_whitespace = text.search(/\s\S+\s*$/);
			if (first_whitespace !== -1)
				return [node.from + 4 + first_whitespace, node.to - 3];
			else
				return [node.from, node.to - 3];
		} else if (from <= node.from + 3 && !backwards) {
			const text = doc.sliceString(node.from + 3, node.to - 3);
			const regex = /^\s*\S+\s/g;
			const match = regex.exec(text);
			if (match)
				return [node.from + 3, node.from + 2 + regex.lastIndex];
			else
				return [node.from + 3, node.to];
		}
	}

	return [from, to];
}
