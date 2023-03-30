import { EditorSelection, EditorState, SelectionRange } from '@codemirror/state';
import { getUserEvents, nodesInSelection } from '../editor-util';
import { treeParser } from '../tree-parser';
import { text_insert } from '../edit-logic/insert';
import { text_delete } from '../edit-logic/delete';
import { cursor_move } from '../edit-logic/cursor';
import { CriticMarkupOperation } from '../../types';
import { editorLivePreviewField } from 'obsidian';

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

		const changed_ranges: CriticMarkupOperation[] = [];

		tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
			let text = '';
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
			let offset = 0;

			for (const range of changed_ranges) {
				const insert_operation = text_insert(range, nodes, offset);
				changes.push(...insert_operation.changes);
				selections.push(insert_operation.selection);
				offset = insert_operation.offset;
			}

			return tr.startState.update({
				changes,
				selection: EditorSelection.create(selections),
			});
		} else if (operation_type === OperationType.DELETION) {
			const userEvents = getUserEvents(tr);
			const backwards_delete = userEvents.includes('delete.backward') || userEvents.includes('delete.selection.backward');
			const group_delete = userEvents.includes('delete.group');
			const delete_selection = userEvents.includes('delete.selection');

			let offset = 0;
			for (const range of changed_ranges) {
				const delete_operation = text_delete(range, nodes, offset, tr.startState.doc, backwards_delete, group_delete, delete_selection, tr.startState);
				changes.push(...delete_operation.changes);
				selections.push(delete_operation.selection);
				offset = delete_operation.offset;
			}

			return tr.startState.update({
				changes,
				selection: EditorSelection.create(selections),
			});
		}

		// 	} else if (tr.isUserEvent('paste')) {
		//
		// 	}
	}


	else if (tr.isUserEvent('select') /*&& tr.startState.field(editorLivePreviewField)*/) {
		// @ts-ignore
		const nodes = nodesInSelection(tr.startState.field(treeParser).tree);

		const userEvents = getUserEvents(tr);
		const backwards_select = userEvents.includes('select.backward');
		const group_select = userEvents.includes('select.group');
		const is_selection = userEvents.includes('select.extend');
		const selections: SelectionRange[] = [];

		for (const range of tr.selection!.ranges) {
			const cursor_operation = cursor_move(range, nodes, tr.startState.doc, tr.startState, backwards_select, group_select, is_selection);
			selections.push(cursor_operation.selection);
		}

		return tr.startState.update({
			selection: EditorSelection.create(selections),
		});
	}

	return tr;
});
