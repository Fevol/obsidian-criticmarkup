import { ChangeSet, EditorSelection, EditorState, SelectionRange } from '@codemirror/state';
import { adjacentNode, nodeAtCursorLocation, nodesInSelection } from './editor-util';
import { treeParser } from './tree-parser';
import { criticmarkupLanguage } from './parser';

enum OperationType {
	INSERTION,
	DELETION,
	REPLACEMENT,
}

enum EventType {
	NONE,
	INSERTION,
	DELETION,
	PASTE,
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

		let text = '';
		const changed_ranges: number[] = [];

		tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
			changed_ranges.push(toA - fromA, toB - fromB);

			// @ts-ignore
			if (inserted.text.length === 1 && inserted.text[0] === '')
				text += '';
			else {
				// @ts-ignore (text exists on Text)
				const change_text = inserted.text.join('');
				text += change_text.length ? change_text : '\n';
			}
		});

		if (!changed_ranges[1])
			operation_type = OperationType.DELETION;
		else if (changed_ranges[0])
			operation_type = OperationType.REPLACEMENT;
		else
			operation_type = OperationType.INSERTION;

		// const node_tree = criticmarkupLanguage.parser.parse(text);
		// // @ts-ignore
		// let is_node = nodesInSelection(node_tree).length > 0;

		// FIXME: This is tr of the endstate
		// @ts-ignore
		const nodes = nodesInSelection(tr.startState.field(treeParser).tree);


		if (operation_type === OperationType.INSERTION) {
			const selection_start = <number>tr.selection?.ranges?.[0]?.from - 1;
			const selection_end = selection_start - changed_ranges[1] + 1;

			const node = nodeAtCursorLocation(nodes, selection_end);
			if (!node) {
				const left_adjacent_node = adjacentNode(nodes, selection_start, true);
				const right_adjacent_node = adjacentNode(nodes, selection_end, false);

				let replacement_start: number;
				let offset = changed_ranges[1];
				if (left_adjacent_node?.type === "Addition" && selection_end === left_adjacent_node.to) {
					replacement_start = left_adjacent_node.to - 3;
				} else if (right_adjacent_node?.type === "Addition" && selection_end === right_adjacent_node.from) {
					replacement_start = right_adjacent_node.from + 3;
				} else {
					replacement_start = selection_end;
					offset += 3;
					text = `{++${text}++}`;
				}
				tr = tr.startState.update({
					changes: [{
						// @ts-ignore
						from: replacement_start,
						to: replacement_start,
						insert: text,
					}],
					selection: EditorSelection.cursor(replacement_start + offset),
				});
			}
		} else if (operation_type === OperationType.DELETION) {
			let selection_start = tr.startState.selection?.ranges?.[0]?.from;
			let selection_end = tr.startState.selection?.ranges?.[0]?.to;


			const backwards_delete = tr.isUserEvent('delete.backward') || tr.isUserEvent('delete.selection.backward');
			if (selection_start === selection_end) {
				if (backwards_delete)
					selection_start -= changed_ranges[0]
				else
					selection_end += changed_ranges[0];
			}

			const node = nodeAtCursorLocation(nodes, backwards_delete ? selection_start : selection_end);
			console.log(node, selection_start, nodes[0])
			if (!node) {
				let deleted_text = tr.startState.doc.sliceString(selection_start - 1, selection_end + 1);

				// TODO: Adjacent nodes also allows for whitespaces in Google Docs
				let is_word_selection = false;
				let is_punctuation_selection = false;
				const right_adjacent_node = adjacentNode(nodes, selection_end, false);

				if (!selection_start && selection_end === tr.startState.doc.length) {
					/* Do nothing */
				} else if (!selection_start) {
					is_punctuation_selection = /\s/.test(deleted_text[0]) && /\p{P}/u.test(deleted_text[deleted_text.length - 1]) && right_adjacent_node?.from !== selection_end;
					deleted_text = deleted_text.slice(0, -1 + +is_punctuation_selection || undefined);
				} else if (selection_end === tr.startState.doc.length) {
					is_word_selection = /\s/.test(deleted_text[0]);
					deleted_text = deleted_text.slice(1 - +is_word_selection);
				} else {
					is_word_selection = /\s/.test(deleted_text[0]) && /\s/.test(deleted_text[deleted_text.length - 1]);
					is_punctuation_selection = !is_word_selection && /\s/.test(deleted_text[0]) && /\p{P}/u.test(deleted_text[deleted_text.length - 1]) && right_adjacent_node?.from !== selection_end;
					deleted_text = deleted_text.slice(1 - +is_punctuation_selection, -1 + +is_word_selection || undefined);
				}

				const stats = `(${backwards_delete ? "BACKWARDS" : "FORWARDS"}) ${is_word_selection ? "WORD" : is_punctuation_selection ? "PUNCTUATION" : "CHARACTER"} SELECTION`;


				let deletion_start: number;
				let deletion_end: number | undefined = undefined;
				let selection: SelectionRange | undefined;
				let keep_transaction = true;

				const left_adjacent_node = adjacentNode(nodes, selection_start, true);
				if (left_adjacent_node?.type === "Deletion" && selection_start === left_adjacent_node.to) {
					console.log(`CASE 1 ${stats}`)
					deletion_start = left_adjacent_node.to - 3;
				}

				else if (right_adjacent_node?.type === "Deletion" && selection_end === right_adjacent_node.from) {
					console.log(`CASE 2 ${stats}`)
					deletion_start = right_adjacent_node.from + (backwards_delete ? 3 : 0);
				}

				else {
					console.log(`CASE 3 ${stats}`)
					deletion_start = selection_start - +is_punctuation_selection;
					deletion_end = selection_end + +is_word_selection;
					deleted_text = `{--${deleted_text}--}`;
					selection = EditorSelection.cursor(backwards_delete ? selection_start : selection_end + 6 + +is_word_selection);
					keep_transaction = false;
				}

				const new_tr = tr.startState.update({
					changes: [{
						from: deletion_start,
						to: deletion_end ?? deletion_start,
						insert: deleted_text,
					}],
					selection,
				});

				if (keep_transaction)
					return [tr, new_tr];
				return [new_tr];

			} else if (node.type === 'Deletion') {
				const offset = (selection_start - node.from < 3 || node.to - selection_end < 3) ? 2 : 0;
				const cursor_location = backwards_delete ? (selection_start - offset) : (selection_end + offset);

				console.log("CASE 4")
				return [tr.startState.update({
					selection: EditorSelection.cursor(cursor_location),
				})];
			}
		} else if (tr.isUserEvent('paste')) {

		}
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
