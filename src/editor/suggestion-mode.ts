import { EditorSelection, EditorState, SelectionRange, Transaction } from '@codemirror/state';
import { adjacentCursorNode, adjacentNode, nodeAtCursorLocation, nodesInRange, nodesInSelection } from './editor-util';
import { treeParser } from './tree-parser';
import type { CriticMarkupNode } from '../types';
import { indexOfRegex, lastIndexOfRegex, removeBrackets, spliceString, wrapBracket } from '../util';

enum OperationType {
	INSERTION,
	DELETION,
	REPLACEMENT,
	SELECTION,
}

enum EventType {
	NONE,
	INSERTION,
	DELETION,
	PASTE,
}

function getUserEvents(tr: Transaction) {
	//@ts-ignore (Transaction has annotations)
	return tr.annotations.map(x => x.value).filter(x => typeof x === 'string');
}


function groupDelete(tr: Transaction, node: CriticMarkupNode | undefined, nodes: CriticMarkupNode[],
					 from: number, to: number, backwards: boolean): [number, number] {
	if (node) {
		if (to >= node.to - 3 && backwards) {
			const text = tr.startState.doc.sliceString(node.from + 3, node.to - 3);
			const first_whitespace = text.search(/\s\S+\s*$/);
			if (first_whitespace !== -1)
				return [node.from + 4 + first_whitespace, node.to - 3];
			else
				return [node.from, node.to - 3];
		} else if (from <= node.from + 3 && !backwards) {
			const text = tr.startState.doc.sliceString(node.from + 3, node.to - 3);
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


export const suggestionMode = EditorState.transactionFilter.of(tr => {
	if (tr.docChanged) {

		let operation_type: OperationType;
		let event_type: EventType = EventType.NONE;

		if (tr.isUserEvent('input'))
			event_type = EventType.INSERTION;
		else if (tr.isUserEvent('delete'))
			event_type = EventType.DELETION;
		else if (tr.isUserEvent('input.paste') || tr.isUserEvent('paste'))
			event_type = EventType.PASTE;

		if (!event_type) return tr;

		const changed_ranges: {
			from: number;
			to: number;
			offset: {
				removed: number,
				added: number,
			};
			inserted: string;
			deleted: string | undefined;
		}[] = [];

		tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
			let text = ''
			// @ts-ignore
			if (inserted.text.length === 1 && inserted.text[0] === '')
				text += '';
			else {
				// @ts-ignore (text exists on Text)
				const change_text = inserted.text.join('');
				text += change_text.length ? change_text : '\n';
			}

			changed_ranges.push({
				from: fromA,
				to: toA,
				offset: {
					removed: toA - fromA,
					added: toB - fromB,
				},
				inserted: text,
				deleted: toA - fromA ? tr.startState.doc.sliceString(fromA, toA) : '',
			});
		});

		if (changed_ranges[0].offset.removed) {
			if (!changed_ranges[0].offset.added)
				operation_type = OperationType.DELETION;
			else
				operation_type = OperationType.REPLACEMENT;
		} else
			operation_type = OperationType.INSERTION;

		// @ts-ignore
		const nodes = nodesInSelection(tr.startState.field(treeParser).tree);
		const changes = [];
		const selections: SelectionRange[] = [];

		if (operation_type === OperationType.INSERTION) {
			let previous_added = -1;

			for (const range of changed_ranges) {
				const node = nodeAtCursorLocation(nodes, range.to);
				previous_added += range.offset.added;

				if (!node) {
					const left_adjacent_node = adjacentCursorNode(nodes, range.from, true);
					const right_adjacent_node = adjacentCursorNode(nodes, range.to, false);

					let replacement_start: number;
					let offset = range.offset.added;
					if (left_adjacent_node && left_adjacent_node.to === range.from) {
						replacement_start = left_adjacent_node.to - 3;
					} else if (right_adjacent_node && right_adjacent_node.from === range.to) {
						replacement_start = right_adjacent_node.from + 3;
					} else {
						replacement_start = range.to;
						range.inserted = `{++${range.inserted}++}`;
						previous_added += 6;
						offset -= 3;
					}
					changes.push({
						from: replacement_start,
						to: replacement_start,
						insert: range.inserted,
					});
					selections.push(EditorSelection.cursor(replacement_start + offset + previous_added));
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
					selections.push(EditorSelection.cursor(range.to + range.offset.added + previous_added));
				}
			}

			return tr.startState.update({
				changes,
				selection: EditorSelection.create(selections),
			});
		}


		else if (operation_type === OperationType.DELETION) {
			const userEvents = getUserEvents(tr);
			const backwards_delete = userEvents.includes('delete.backward') || userEvents.includes('delete.selection.backward');
			const group_delete = userEvents.includes('delete.group');
			const delete_selection = userEvents.includes('delete.selection');

			let chars_added = 0;
			for (const range of changed_ranges) {
				const nodes_in_range = nodesInRange(nodes, range.from, range.to);

				const node = nodeAtCursorLocation(nodes_in_range, backwards_delete ? range.from : range.to);

				if (!nodes_in_range.length && !node) {
					const is_start = !range.from;
					const is_end = range.to === tr.startState.doc.length - 1
					let deleted_text = tr.startState.doc.sliceString(range.from + (is_start ? 0 : -1), range.to + (is_end ? 0 : 1));

					const left_adjacent_node = adjacentCursorNode(nodes, range.from, true);
					const right_adjacent_node = adjacentCursorNode(nodes, range.to, false);

					// TODO: Only matches a single space left/right

					const is_left_space = is_start || /\s/.test(deleted_text[0]) || !!left_adjacent_node && left_adjacent_node.to === range.from &&
						/\s/.test(tr.startState.doc.sliceString(range.from - 4, range.from - 3))
					const is_right_space = is_end || /\s/.test(deleted_text![deleted_text!.length - 1]);

					const is_right_punctuation = is_end || /\p{P}/u.test(deleted_text[deleted_text.length - 1]) &&
						!(right_adjacent_node && right_adjacent_node.from === range.to) &&
						!(left_adjacent_node && left_adjacent_node.to === range.from)

					const is_word_delete = is_left_space && is_right_space;
					const is_punctuation_delete = !is_word_delete && is_right_punctuation;

					deleted_text = deleted_text.slice(1 - +is_punctuation_delete || undefined, -1 + +is_word_delete || undefined);

					range.from -= +is_punctuation_delete;
					range.to += +is_word_delete;


					let selection_start = range.from;
					let selection_end = range.to;

					let cursor = undefined;
					let keep_original_transaction = true;

					// CASE 1: Merge two Deletion nodes if they become next to each other
					if (left_adjacent_node?.type === "Deletion" && right_adjacent_node?.type === "Deletion"
						&& range.from === left_adjacent_node.to && range.to === right_adjacent_node.from) {
						selection_start = left_adjacent_node.to - 3;
						selection_end = right_adjacent_node.from + 3;
						keep_original_transaction = false;
						cursor = EditorSelection.cursor(backwards_delete ? selection_start + chars_added : selection_start + deleted_text.length + chars_added);
						chars_added -= 6;
					}

					// CASE 2: Deleting character to the right of a Deletion node
					else if (left_adjacent_node?.type === "Deletion" && range.from === left_adjacent_node.to) {
						selection_start = left_adjacent_node.to - 3;
						selection_end = selection_start;
						cursor = EditorSelection.cursor(backwards_delete ? selection_start + chars_added : left_adjacent_node.to + deleted_text.length + chars_added);
					}

					// CASE 3: Deleting character to the left of a Deletion node
					else if (right_adjacent_node?.type === "Deletion" && range.to === right_adjacent_node.from) {
						selection_start = right_adjacent_node.from + 3;
						selection_end = selection_start;
						cursor = EditorSelection.cursor(backwards_delete ? range.from + chars_added : selection_start + chars_added);
					}

					// CASE 4: Deleting regular character outside node
					else {
						deleted_text = `{--${deleted_text}--}`;
						cursor = EditorSelection.cursor(backwards_delete ? selection_start + chars_added : selection_end + chars_added + 6);
						chars_added += 6;
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

					if (cursor)
						selections.push(cursor);

				}

				else if (delete_selection) {
					// const all_delete = nodes_in_range.every(node => node.type === 'Deletion');
					// TODO: Check whether addition nodes and substitution nodes should also be deleted like this

					// FIXME: Partially selected brackets will be fully removed too

					let content = removeBrackets(range.deleted!, nodes_in_range, range.from);
					if (nodes_in_range[0]?.from >= range.from)
						content = `{--${content}`;
					if (nodes_in_range[nodes_in_range.length - 1]?.to > range.to)
						content += `${content}--}`;
					console.log(content)

					changes.push({
						from: range.from,
						to: range.to,
						insert: wrapBracket(content, 'Deletion'),
					});
					selections.push(EditorSelection.cursor(backwards_delete ? range.from + chars_added : range.to + chars_added - 6 * (nodes_in_range.length - 1)));
					chars_added -= 6 * (nodes_in_range.length - 1);
				}

				else if (node && node.type === 'Deletion') {
					const in_brackets = range.from <= node.from + 3 || range.to >= node.to - 3;

					let cursor_location = 0;
					if (backwards_delete) {
						if (range.to === node.to) {
							if (group_delete)
								cursor_location = groupDelete(tr, node, nodes, range.from, range.to, backwards_delete)[0];
							else
								cursor_location = node.to - 4;
						} else {
							cursor_location = in_brackets ? node.from : range.from;
						}
					} else {
						if (range.from === node.from) {
							if (group_delete)
								cursor_location = groupDelete(tr, node, nodes, range.from, range.to, backwards_delete)[1];
							else
								cursor_location = node.from + 4;
						} else {
							cursor_location = in_brackets ? node.to : range.to;
						}
					}

					selections.push(EditorSelection.cursor(cursor_location + chars_added));
				}


				else if (node && node.type === 'Addition') {
					if (node.from + 3 === range.from && node.to - 3 === range.to) {
						changes.push({
							from: node.from,
							to: node.to,
							insert: '',
						});
						selections.push(EditorSelection.cursor(node.from + chars_added));
						chars_added -= 6;
					} else {
						changes.push({
							from: range.from,
							to: range.to,
							insert: '',
						});
						selections.push(EditorSelection.cursor(range.from + chars_added));
					}
				}
			}

			return tr.startState.update({
				changes,
				selection: EditorSelection.create(selections),
			});
		}

	// 	} else if (tr.isUserEvent('paste')) {
	//
	// 	}
	// } else if (tr.isUserEvent('select')) {
	//
	}

	return tr;
});
