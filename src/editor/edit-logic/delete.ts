import type { CriticMarkupRange, EditorChange, OperationReturn } from '../../types';
import type { Text } from '@codemirror/state';
import { EditorSelection, EditorState, SelectionRange } from '@codemirror/state';
import { wrapBracket } from '../../util';
import { CriticMarkupNodes } from '../criticmarkup-nodes';
import { deleteGroup } from '../editor-util';

export function text_delete(range: CriticMarkupRange, nodes: CriticMarkupNodes, offset: number, doc: Text,
							backwards_delete: boolean, group_delete: boolean, selection_delete: boolean, state: EditorState): OperationReturn {

	const nodes_in_range = nodes.filter_range(range.from, range.to, true);

	const changes: EditorChange[] = [];

	// Default to 0 in case something goes tremendously wrong
	// FIXME: Whenever this happens, you know some case has not been implemented yet
	let selection: SelectionRange = EditorSelection.cursor(0);

	if (selection_delete) {
		if (nodes_in_range.nodes.length === 1 && nodes_in_range.get(0).encloses(range.from, range.to)) {
			const node = nodes_in_range.get(0);
			const include_left_bracket = range.from <= node.from + 3;
			const include_right_bracket = range.to >= node.to - 3;
			if (include_left_bracket && include_right_bracket) {
				if (node.type === 'Addition') {
					changes.push({
						from: node.from,
						to: node.to,
						insert: '',
					});
					selection = EditorSelection.cursor(node.from);
					offset -= node.to - node.from;
				} else {
					selection = EditorSelection.cursor(backwards_delete ? node.from : node.to);
				}
			} else {
				if (node.type === 'Addition')
					changes.push({
						from: include_left_bracket ? node.from + 3 : range.from,
						to: include_right_bracket ? node.to - 3 : range.to,
						insert: '',
					});
				selection = EditorSelection.cursor(backwards_delete ?
					(include_left_bracket ? node.from : range.from) :
					(include_right_bracket ? node.to - (node.to - range.from) + 3 : range.to));
			}
		} else {
			const unwrap_operation = nodes_in_range.unwrap_in_range(range.deleted!, range.from, range.to, 'Deletion', doc);
			changes.push({
				from: unwrap_operation.start,
				to: unwrap_operation.to,
				insert: unwrap_operation.prefix + wrapBracket(unwrap_operation.output, 'Deletion') + unwrap_operation.suffix,
			});

			let cursor = offset;
			if (backwards_delete) {
				if (unwrap_operation.prefix) {
					cursor += unwrap_operation.start + unwrap_operation.prefix.length;
				} else {
					if (range.from - unwrap_operation.start <= 3)
						cursor += unwrap_operation.start;
					else
						cursor += range.from;
				}
			} else {
				cursor += ((!unwrap_operation.suffix && unwrap_operation.to - range.to <= 3) ? unwrap_operation.to : range.to)
					+ unwrap_operation.offset + 6;

			}

			// FIXME: Changes of selectiondelete should be applied immediately to the doc string (since brackets can change)
			//  Failure case: 'X{++ABC++}X'
			//                 ^^^^^ ^^^^^  (selections)
			selection = EditorSelection.cursor(cursor);
			offset += unwrap_operation.offset + 6;
		}
	} else {
		let cursor = backwards_delete ? range.to : range.from;
		let node = nodes.at_cursor(cursor);

		if (node) {
			if (backwards_delete && node.from + 3 >= range.from) {
				range.to = node.from;
				range.from = group_delete ? deleteGroup(range.to - 1, !backwards_delete, state): range.to - 1;
				node = undefined;
			}
			else if (!backwards_delete && node.to - 3 <= range.to) {
				range.from = node.to;
				range.to = group_delete ? deleteGroup(range.from + 1, !backwards_delete, state): range.from + 1
				node = undefined;
			}
			if (!node) {
				cursor = backwards_delete ? range.to : range.from;
				range.deleted = doc.sliceString(range.from, range.to);
			}
		}

		if (!node) {
			const left_adjacent_node = nodes.adjacent_to_cursor(cursor, true);
			const right_adjacent_node = nodes.adjacent_to_cursor(cursor, false);
			let cursor_location = 0;


			let adjacent_deletion_node = undefined;
			let left_deletion_node = true;
			if (left_adjacent_node?.type === 'Deletion' && left_adjacent_node.to >= range.from && left_adjacent_node.to <= range.to)
				adjacent_deletion_node = left_adjacent_node;
			else if (right_adjacent_node?.type === 'Deletion' && right_adjacent_node.from === range.to) {
				adjacent_deletion_node = right_adjacent_node;
				left_deletion_node = false;
			}

			let prefix = '';
			let suffix = '';

			let deleted_content = '';
			let deletion_from = 0;
			let deletion_to = 0;

			let affected_node = undefined;
			let node_fully_deleted = false;

			let remove = 0;

			if (backwards_delete && left_adjacent_node && left_adjacent_node.to > range.from) {
				remove = group_delete ? deleteGroup(left_adjacent_node.to - 3, false, state) : left_adjacent_node.to - 4;
				cursor_location = remove;
				const outside_content = doc.sliceString(left_adjacent_node.to, range.to);
				if (left_adjacent_node.type === 'Addition') {
					affected_node = left_adjacent_node;
					const addition_content = doc.sliceString(remove, left_adjacent_node.to - 3);
					deleted_content = addition_content + outside_content;
					deletion_from = remove;
					deletion_to = range.to;
					if (cursor_location === left_adjacent_node.from + 3) {
						deletion_from = left_adjacent_node.from;
						node_fully_deleted = true;
						cursor_location = deletion_from;
					} else {
						prefix = '++}';
						cursor_location = deletion_from + 3;
					}
				} else if (left_adjacent_node.type === 'Deletion') {
					cursor_location = remove;
					deleted_content = outside_content;
					deletion_from = left_adjacent_node.to;
					deletion_to = range.to;
				}
			} else if (!backwards_delete && right_adjacent_node && right_adjacent_node.from < range.to) {
				remove = group_delete ? deleteGroup(right_adjacent_node.from + 3, true, state) : right_adjacent_node.from + 4;
				const outside_content = doc.sliceString(range.from, right_adjacent_node.from);
				if (right_adjacent_node.type === 'Addition') {
					affected_node = right_adjacent_node;
					const addition_content = doc.sliceString(right_adjacent_node.from + 3, remove);

					deleted_content = outside_content + addition_content;
					deletion_from = range.from;
					if (remove === right_adjacent_node.to - 3) {
						deletion_to = right_adjacent_node.to;
						node_fully_deleted = true;
						cursor_location = right_adjacent_node.to;
					} else {
						suffix = '{++';
						deletion_to = remove;
						cursor_location = remove + 3;
					}
				} else if (right_adjacent_node.type === 'Deletion') {
					cursor_location = remove;
					deleted_content = outside_content;
					deletion_from = range.from;
					deletion_to = right_adjacent_node.from;
				}
			} else {
				deleted_content = range.deleted!;
				deletion_from = range.from;
				deletion_to = range.to;
				cursor_location = backwards_delete ? range.from : range.to + 6;
				if (adjacent_deletion_node && left_deletion_node === backwards_delete) {
					if (!group_delete) {
						cursor_location = cursor_location + (backwards_delete ? -3 : 3);
					} else {
						cursor_location = deleteGroup(backwards_delete ? adjacent_deletion_node.to - 3 : adjacent_deletion_node.from + 3, !backwards_delete, state);
						if (group_delete) {
							cursor_location += 4;
							if (left_deletion_node && cursor_location <= adjacent_deletion_node.from) {
								cursor_location = adjacent_deletion_node.from;
							} else if (!left_deletion_node && cursor_location + 3 >= adjacent_deletion_node.to) {
								cursor_location = adjacent_deletion_node.to + 6;
							}
							// else
								// cursor_location -= length;
						}
					}
				}
			}

			if (adjacent_deletion_node) {
				if (affected_node) {
					changes.push({
						from: node_fully_deleted ? affected_node.from : deletion_from,
						to: node_fully_deleted ? affected_node.to: deletion_to,
						insert: node_fully_deleted ? '' : (prefix || suffix),
					});
				} else {
					changes.push({
						from: deletion_from,
						to: deletion_to,
						insert: '',
					});
				}

				const insert_location = left_deletion_node ? adjacent_deletion_node.to - 3 : adjacent_deletion_node.from + 3;
				changes.push({
					from: insert_location,
					to: insert_location,
					insert: deleted_content,
				})
				if (!backwards_delete) cursor_location -= 6;

				selection = EditorSelection.cursor(cursor_location);
			} else {
				changes.push({
					from: deletion_from,
					to: deletion_to,
					insert: prefix + wrapBracket(deleted_content, 'Deletion') + suffix,
				});

				selection = EditorSelection.cursor(cursor_location);
			}
		} else if (node && node.type === 'Deletion') {
			let cursor_location;
			if (backwards_delete && node.from && range.from <= node.from + 2 + (group_delete ? 1 : 0)) {
				const remove = group_delete ? deleteGroup(node.from, false, state) : node.from - 1;
				changes.push({
					from: remove,
					to: node.from,
					insert: '',
				});
				changes.push({
					from: node.from + 3,
					to: node.from + 3,
					insert: doc.sliceString(remove, node.from),
				});
				cursor_location = remove;
			} else if (!backwards_delete && node.to && range.to >= node.to - 2 - (group_delete ? 1 : 0)) {
				const remove = group_delete ? deleteGroup(node.to, true, state) : node.to + 1;
				changes.push({
					from: node.to,
					to: remove,
					insert: '',
				});
				changes.push({
					from: node.to - 3,
					to: node.to - 3,
					insert: doc.sliceString(node.to, remove),
				});
				cursor_location = remove;
			} else {
				cursor_location = backwards_delete ? range.from : range.to;
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
