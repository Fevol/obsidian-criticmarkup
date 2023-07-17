import { EditorSelection, EditorState, SelectionRange } from '@codemirror/state';
import { cursorMoved, getUserEvents, nodesInSelection } from '../editor-util';
import { treeParser } from '../tree-parser';
import { text_insert } from '../edit-logic/insert';
import { text_delete } from '../edit-logic/delete';
import { cursor_move } from '../edit-logic/cursor';
import { CriticMarkupOperation } from '../../types';

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



let last_char_position = -1;

const vim_action_resolver = {
	'moveByCharacters': {
		'group': false,
	}
}

// }
// { keys: 'h', motion: 'moveByCharacters',
// { keys: 'l', motion: 'moveByCharacters',
// { keys: 'j', motion: 'moveByLines',
// { keys: 'k', motion: 'moveByLines',
// { keys: 'H', motion: 'moveToTopLine',
// { keys: 'M', motion: 'moveToMiddleLine',
// { keys: 'L', motion: 'moveToBottomLine',
// { keys: 'gj', motion: 'moveByDisplayLines',
// { keys: 'gk', motion: 'moveByDisplayLines',
// { keys: 'w', motion: 'moveByWords',
// { keys: 'W', motion: 'moveByWords',
// { keys: 'e', motion: 'moveByWords',
// { keys: 'E', motion: 'moveByWords',
// { keys: 'b', motion: 'moveByWords',
// { keys: 'B', motion: 'moveByWords',
// { keys: 'ge', motion: 'moveByWords',
// { keys: 'gE', motion: 'moveByWords',
// { keys: '{', motion: 'moveByParagraph',
// { keys: '}', motion: 'moveByParagraph',
// { keys: '(', motion: 'moveBySentence',
// { keys: ')', motion: 'moveBySentence',
// { keys: '<C-f>', motion: 'moveByPage',
// { keys: '<C-b>', motion: 'moveByPage',
// { keys: '<C-d>', motion: 'moveByScroll',
// { keys: '<C-u>', motion: 'moveByScroll',
// { keys: 'gg', motion: 'moveToLineOrEdgeOfDocument',
// { keys: 'G', motion: 'moveToLineOrEdgeOfDocument',
// {keys: "g$", type: "motion", motion: "moveToEndOfDisplayLine"},
// {keys: "g^", type: "motion", motion: "moveToStartOfDisplayLine"},
// {keys: "g0", type: "motion", motion: "moveToStartOfDisplayLine"},
// { keys: '0', motion: 'moveToStartOfLine' },
// { keys: '^', motion: 'moveToFirstNonWhiteSpaceCharacter' },
// { keys: '+', motion: 'moveByLines',
// { keys: '-', motion: 'moveByLines',
// { keys: '_', motion: 'moveByLines',
// { keys: '$', motion: 'moveToEol',
// { keys: '%', motion: 'moveToMatchedSymbol',
// { keys: 'f<character>', motion: 'moveToCharacter',
// { keys: 'F<character>', motion: 'moveToCharacter',
// { keys: 't<character>', motion: 'moveTillCharacter',
// { keys: 'T<character>', motion: 'moveTillCharacter',
// { keys: ';', motion: 'repeatLastCharacterSearch',
// { keys: ',', motion: 'repeatLastCharacterSearch',
// { keys: '\'<character>', motion: 'goToMark',
// { keys: '`<character>', motion: 'goToMark',
// { keys: ']`', motion: 'jumpToMark',
// { keys: '[`', motion: 'jumpToMark',
// { keys: ']\'', motion: 'jumpToMark',
// { keys: '[\'', motion: 'jumpToMark',
// { keys: ']<character>', motion: 'moveToSymbol',
// { keys: '[<character>', motion: 'moveToSymbol',
// { keys: '|', motion: 'moveToColumn'},
// { keys: 'o', motion: 'moveToOtherHighlightedEnd', context:'visual'},
// { keys: 'O', motion: 'moveToOtherHighlightedEnd',
//
//
// 	'moveToLineOrEdgeOfDocument':
// }


function isUserEvent(event: string, events: string[]): boolean {
	return events.some(e => e.startsWith(event));
}

export const suggestionMode = EditorState.transactionFilter.of(tr => {
	const userEvents = getUserEvents(tr);
	const vim_mode = app.workspace.activeEditor?.editor?.cm.cm !== undefined;

	// Resolves used vim cursor movements since they do not receive user event annotations
	if (!tr.docChanged && tr.selection && vim_mode) {
		if (cursorMoved(tr))
			userEvents.push(tr.startState.selection.ranges[0].from < tr.selection!.ranges[0].from ? 'select.forward' : 'select.backward');
		if ( vim_action_resolver[app.workspace.activeEditor?.editor?.cm.cm?.state.vim.lastMotion?.name as keyof typeof vim_action_resolver]?.group)
			userEvents.push('select.group');
	}


	// Handle edit operations
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
			// @ts-ignore (Inserted always exists when iterating changes)
			if (inserted.text.length === 1 && inserted.text[0] === '')
				text += '';
			else {
				// @ts-ignore (text exists on Text in inserted)
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

	// Handle cursor movements
	else if (isUserEvent('select', userEvents) && cursorMoved(tr) /*&& tr.startState.field(editorLivePreviewField)*/) {
		// Pointer/Mouse selection does not need any further processing
		if (userEvents.includes('select.pointer'))
			return tr;


		// FIXME: nodes in selection is currently not cached
		const nodes = nodesInSelection(tr.startState.field(treeParser).tree);

		const backwards_select = userEvents.includes('select.backward');
		const group_select = userEvents.includes('select.group');
		const is_selection = userEvents.includes('select.extend');
		const selections: SelectionRange[] = [];
		for (const [idx, range] of tr.selection!.ranges.entries()) {
			const cursor_operation = cursor_move(range,  tr.startState.selection!.ranges[idx], nodes,
				tr.startState.doc, tr.startState, backwards_select, group_select, is_selection, vim_mode);
			selections.push(cursor_operation.selection);
		}

		return tr.startState.update({
			selection: EditorSelection.create(selections),
			// TODO: Check if filter should only apply in vim mode?
			filter: false,
		});
	}

	return tr;
});
