import { EditorSelection, EditorState, SelectionRange, Transaction } from '@codemirror/state';
import { adjacentCursorNode, adjacentNode, nodeAtCursorLocation, nodesInSelection } from './editor-util';
import { treeParser } from './tree-parser';
import type { CriticMarkupNode } from '../types';
import { indexOfRegex, lastIndexOfRegex } from '../util';

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


			for (const range of changed_ranges) {
				let deleted_text = tr.startState.doc.sliceString(range.from - 1, range.to + 1);
				const node = nodeAtCursorLocation(nodes, range.to);

				if (!node) {
					let is_word_delete = false;
					let is_punctuation_delete = false;

					const left_adjacent_node = adjacentCursorNode(nodes, range.from, true);
					const right_adjacent_node = adjacentCursorNode(nodes, range.to, false);

					console.log(range, backwards_delete, group_delete);
					if (!range.from && range.to === tr.startState.doc.length) {
						/* Do nothing */
					} else if (!range.from) {
						/* Delete to start */
						is_punctuation_delete = /\s/.test(deleted_text[0]) && /\p{P}/u.test(deleted_text[deleted_text.length - 1])
																			 && right_adjacent_node?.from !== range.to;
						deleted_text = deleted_text!.slice(0, -1 + + is_punctuation_delete || undefined);
					} else if (range.to === tr.startState.doc.length) {
						/* Delete to end */
						is_word_delete = /\s/.test(deleted_text![0]);
						deleted_text = deleted_text!.slice(1 - + is_word_delete || undefined);
					} else {
						is_word_delete = /\s/.test(deleted_text![0]) && /\s/.test(deleted_text![deleted_text!.length - 1]);
						is_punctuation_delete = !is_word_delete &&
							/\s/.test(deleted_text![0]) && /\p{P}/u.test(deleted_text![deleted_text!.length - 1]) &&
							right_adjacent_node?.from !== range.to;
						deleted_text = deleted_text!.slice(1 - + is_punctuation_delete || undefined, -1 + + is_word_delete || undefined);
					}


					let selection_start = range.from;
					let selection_end = range.to;
					let cursor = undefined;
					let keep_original_transaction = true;

					// CASE 1: Merge two Deletion nodes if they become next to each other
					if (left_adjacent_node?.type === "Deletion" && right_adjacent_node?.type === "Deletion"
						&& range.from === left_adjacent_node.to && range.to === right_adjacent_node.from) {
						selection_start = left_adjacent_node.from;
						selection_end = right_adjacent_node.to;

						deleted_text = tr.startState.doc.sliceString(left_adjacent_node.from, left_adjacent_node.to) +
										deleted_text +
							           tr.startState.doc.sliceString(right_adjacent_node.from, right_adjacent_node.to);
					}

					// CASE 2: Deleting character to the right of a Deletion node
					else if (left_adjacent_node?.type === "Deletion" && range.from === left_adjacent_node.to) {
						selection_start = left_adjacent_node.to - 3;
						cursor = EditorSelection.cursor(selection_start);
					}

					// CASE 3: Deleting character to the left of a Deletion node
					else if (right_adjacent_node?.type === "Deletion" && range.to === right_adjacent_node.from) {
						selection_start = right_adjacent_node.from + (backwards_delete ? 3 : 0);
						cursor = EditorSelection.cursor(selection_start);
					}

					// CASE 4: Deleting regular character outside node
					else {
						selection_start = range.from - +is_punctuation_delete;
						selection_end = range.to + +is_word_delete;
						deleted_text = `{--${deleted_text}--}`;
						cursor = EditorSelection.cursor(backwards_delete ? selection_start : selection_end + 6 + +is_word_delete);
						keep_original_transaction = false;
					}

					if (keep_original_transaction) {
						changes.push({
							from: range.from,
							to: range.to,
							insert: '',
						});
					}

					console.log(selection_start, selection_end, deleted_text);

					changes.push({
						from: selection_start,
						to: selection_end,
						insert: deleted_text,
					});

					if (cursor)
						selections.push(cursor);


					console.log(is_punctuation_delete, is_word_delete, deleted_text);
				}
			}

			return tr.startState.update({
				changes,
				selection: EditorSelection.create(selections),
			});
		}













	// 	} else if (operation_type === OperationType.DELETION) {
	// 		let selection_start = tr.startState.selection?.ranges?.[0]?.from;
	// 		let selection_end = tr.startState.selection?.ranges?.[0]?.to;
	//
	// 		const userEvents = getUserEvents(tr);
	// 		const backwards_delete = userEvents.includes('delete.backward') || userEvents.includes('delete.selection.backward');
	// 		const group_delete = userEvents.includes('delete.group');
	//
	// 		if (selection_start === selection_end) {
	// 			if (backwards_delete)
	// 				selection_start -= changed_ranges[0]
	// 			else
	// 				selection_end += changed_ranges[0];
	// 		}
	//
	// 		const node = nodeAtCursorLocation(nodes, backwards_delete ? selection_start : selection_end);
	// 		if (!node) {
	// 			let deleted_text = tr.startState.doc.sliceString(selection_start - 1, selection_end + 1);
	//
	// 			// TODO: Adjacent nodes also allows for whitespaces in Google Docs
	// 			let is_word_selection = false;
	// 			let is_punctuation_selection = false;
	// 			const right_adjacent_node = adjacentCursorNode(nodes, selection_end, false);
	//
	// 			if (!selection_start && selection_end === tr.startState.doc.length) {
	// 				/* Do nothing */
	// 			} else if (!selection_start) {
	// 				is_punctuation_selection = /\s/.test(deleted_text[0]) && /\p{P}/u.test(deleted_text[deleted_text.length - 1]) && right_adjacent_node?.from !== selection_end;
	// 				deleted_text = deleted_text.slice(0, -1 + +is_punctuation_selection || undefined);
	// 			} else if (selection_end === tr.startState.doc.length) {
	// 				is_word_selection = /\s/.test(deleted_text[0]);
	// 				deleted_text = deleted_text.slice(1 - +is_word_selection);
	// 			} else {
	// 				is_word_selection = /\s/.test(deleted_text[0]) && /\s/.test(deleted_text[deleted_text.length - 1]);
	// 				is_punctuation_selection = !is_word_selection && /\s/.test(deleted_text[0]) && /\p{P}/u.test(deleted_text[deleted_text.length - 1]) && right_adjacent_node?.from !== selection_end;
	// 				deleted_text = deleted_text.slice(1 - +is_punctuation_selection, -1 + +is_word_selection || undefined);
	// 			}
	//
	// 			const stats = `(${backwards_delete ? "BACKWARDS" : "FORWARDS"}) ${is_word_selection ? "WORD" : is_punctuation_selection ? "PUNCTUATION" : "CHARACTER"} SELECTION`;
	//
	//
	// 			let deletion_start: number;
	// 			let deletion_end: number | undefined = undefined;
	// 			let selection: SelectionRange | undefined;
	// 			let keep_transaction = true;
	//
	// 			const left_adjacent_node = adjacentCursorNode(nodes, selection_start, true);
	// 			console.log(left_adjacent_node?.to, selection_start, selection_end, right_adjacent_node?.from)
	// 			// CASE 0: DELETION - Merging adjacent nodes
	// 			if (left_adjacent_node?.type === "Deletion" && right_adjacent_node?.type === "Deletion" &&
	// 				selection_start === left_adjacent_node.to && selection_end === right_adjacent_node.from) {
	// 				console.log(`CASE 0 ${stats}`)
	// 				const text = tr.startState.doc.sliceString(left_adjacent_node.from, left_adjacent_node.to - 3) +
	// 							 deleted_text +
	// 						   	 tr.startState.doc.sliceString(right_adjacent_node.from + 3, right_adjacent_node.to);
	// 				return tr.startState.update({
	// 					changes: [{
	// 						from: left_adjacent_node.from,
	// 						to: right_adjacent_node.to,
	// 						insert: text,
	// 					}],
	// 					selection: EditorSelection.cursor(left_adjacent_node.to - 3),
	// 				});
	//
	// 			}
	//
	// 			// CASE 1: DELETION - Deleting character to right of other Deletion node
	// 			if (left_adjacent_node?.type === "Deletion" && selection_start === left_adjacent_node.to) {
	// 				console.log(`CASE 1 ${stats}`)
	// 				deletion_start = left_adjacent_node.to - 3;
	// 			}
	//
	// 			// CASE 2: DELETION - Deleting character to left of other Deletion node
	// 			else if (right_adjacent_node?.type === "Deletion" && selection_end === right_adjacent_node.from) {
	// 				console.log(`CASE 2 ${stats}`)
	// 				deletion_start = right_adjacent_node.from + (backwards_delete ? 3 : 0);
	// 			}
	//
	// 			// CASE 3: DELETION - Deleting regular character
	// 			else {
	// 				console.log(`CASE 3 ${stats}`)
	// 				deletion_start = selection_start - +is_punctuation_selection;
	// 				deletion_end = selection_end + +is_word_selection;
	// 				deleted_text = `{--${deleted_text}--}`;
	// 				selection = EditorSelection.cursor(backwards_delete ? selection_start : selection_end + 6 + +is_word_selection);
	// 				keep_transaction = false;
	// 			}
	//
	// 			const new_tr = tr.startState.update({
	// 				changes: [{
	// 					from: deletion_start,
	// 					to: deletion_end ?? deletion_start,
	// 					insert: deleted_text,
	// 				}],
	// 				selection,
	// 			});
	//
	// 			if (keep_transaction)
	// 				return [tr, new_tr];
	// 			return [new_tr];
	//
	// 		} else if (node.type === 'Deletion') {
	// 			const in_brackets = selection_start <= node.from + 3 || selection_end >= node.to - 3;
	//
	// 			let cursor_location = 0;
	// 			if (selection_start === node.from && !backwards_delete)
	// 				if (group_delete)
	// 					cursor_location = groupDelete(tr, node, nodes, selection_start, selection_end, backwards_delete)[1];
	// 				else
	// 					cursor_location = node.from + 4;
	// 			else if (selection_end === node.to && backwards_delete)
	// 				if (group_delete)
	// 					cursor_location = groupDelete(tr, node, nodes, selection_start, selection_end, backwards_delete)[0];
	// 				else
	// 					cursor_location = node.to - 4;
	// 			else if (backwards_delete)
	// 				cursor_location = in_brackets ? node.from : selection_start;
	// 			else
	// 				cursor_location = in_brackets ? node.to : selection_end;
	//
	//
	// 			// CASE 5: DELETION - Skipping deletion of character within Deletion node
	// 			console.log("CASE 5")
	//
	// 			return [tr.startState.update({
	// 				selection: EditorSelection.cursor(cursor_location),
	// 			})];
	// 		} else if (node.type === 'Addition') {
	// 			// CASE 6: DELETION - Deleting an Addition node if it is empty
	// 			if (node.from + 3 === selection_start && node.to - 3 === selection_end) {
	// 				console.log("CASE 6")
	// 				return [tr.startState.update({
	// 					changes: [{
	// 						from: node.from,
	// 						to: node.to,
	// 						insert: '',
	// 					}],
	// 					selection: EditorSelection.cursor(node.from),
	// 				})];
	// 			}
	//
	// 		}
	// 	} else if (tr.isUserEvent('paste')) {
	//
	// 	}
	// } else if (tr.isUserEvent('select')) {
	//
	}

	return tr;
});


// export const suggestionMode = EditorView.inputHandler.of((view, from, to, text) => {
// 	const tree = criticmarkupLanguage.parser.parse(view.state.doc.toString());
//
// 	// @ts-ignore
// 	const node = nodeAtCursor(tree, view.state.selection?.ranges[0]?.from);
// 	if (!node) {
// 		view.dispatch({
// 			changes: [{
// 				from,
// 				to,
// 				insert: `{++${text}++}`,
// 			}],
// 			selection: EditorSelection.cursor(to + 4),
// 		});
// 		return true;
// 	}
//
// 	return false;
// });
