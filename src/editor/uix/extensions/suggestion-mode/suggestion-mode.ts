import { EditorSelection, EditorState, type Extension, SelectionRange, Transaction } from '@codemirror/state';
import { type PluginSettings } from '../../../../types';

import {
	nodeParser,
	text_insert, text_delete, text_replace, cursor_move,
	cursorMoved, getEditorRanges, getUserEvents
} from '../../../base';


enum OperationType {
	INSERTION,
	DELETION,
	REPLACEMENT,
	SELECTION,
}

const vim_action_resolver = {
	'moveByCharacters': {
		'group': false,
	},
};

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


// FIXME: Ask somebody whether this is the cleanest/most efficient way to access settings inside of the extension
export const suggestionMode = (settings: PluginSettings): Extension => EditorState.transactionFilter.of(tr => applySuggestion(tr, settings));


// TODO: Functionality: Double click mouse should also floodfill (problem: no specific userevent attached)
// TODO: Logic: Inserting/Replacing in Deletion - Result in Substitution or added text in Deletion?
function applySuggestion(tr: Transaction, settings: PluginSettings): Transaction {
	const userEvents = getUserEvents(tr);
	const vim_mode = app.workspace.activeEditor?.editor?.cm.cm !== undefined;

	// Resolves used vim cursor movements since they do not receive user event annotations
	if (!tr.docChanged && tr.selection && vim_mode) {
		if (cursorMoved(tr))
			userEvents.push(tr.startState.selection.ranges[0].from < tr.selection!.ranges[0].from ? 'select.forward' : 'select.backward');
		if (vim_action_resolver[app.workspace.activeEditor?.editor?.cm.cm?.state.vim.lastMotion?.name as keyof typeof vim_action_resolver]?.group)
			userEvents.push('select.group');
	}


	// Handle edit operations
	if (tr.docChanged) {
		const changed_ranges = getEditorRanges(tr.changes, tr.startState.doc);


		const is_recognized_edit_operation = tr.isUserEvent('input') || tr.isUserEvent('paste') || tr.isUserEvent('delete');

		// ISSUE: Pasting an image yields no userEvent that could be used to determine the type, so the
		//      operation type needs to be determined via the changed ranges. However, a change of the state
		//      *will* result in the new transaction being filtered through the suggestion mode filter again (recursion)
		// TODO: Currently, a only transactions with valid userEvents editevents considered
		//       Somehow, someway, image pastes need to get an userevent attached (monkey-around insertFiles?)
		if (!is_recognized_edit_operation)
			return tr;


		let operation_type: OperationType;
		if (changed_ranges[0].offset.added && changed_ranges[0].offset.removed)
			operation_type = OperationType.REPLACEMENT;
		else if (changed_ranges[0].offset.added)
			operation_type = OperationType.INSERTION;
		else if (changed_ranges[0].offset.removed)
			operation_type = OperationType.DELETION;
		else {
			console.error('No operation type could be determined');
			return tr;
		}

		const nodes = tr.startState.field(nodeParser).nodes;
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
		} else if (operation_type === OperationType.REPLACEMENT) {
			let offset = 0;
			for (const range of changed_ranges) {
				const replace_operation = text_replace(range, nodes, offset, tr.startState.doc);
				changes.push(...replace_operation.changes);
				selections.push(replace_operation.selection);
				offset = replace_operation.offset;
			}
		}

		return tr.startState.update({
			changes,
			selection: EditorSelection.create(selections),
			userEvent: 'ignore',
		});
	}

	// Handle cursor movements
	else if (isUserEvent('select', userEvents) && cursorMoved(tr) && settings.alternative_cursor_movement /*&& tr.startState.field(editorLivePreviewField)*/) {
		// Pointer/Mouse selection does not need any further processing
		if (userEvents.includes('select.pointer'))
			return tr;


		const nodes = tr.startState.field(nodeParser).nodes;

		const backwards_select = userEvents.includes('select.backward');
		const group_select = userEvents.includes('select.group');
		const is_selection = userEvents.includes('select.extend');
		const selections: SelectionRange[] = [];
		for (const [idx, range] of tr.selection!.ranges.entries()) {
			const cursor_operation = cursor_move(range, tr.startState.selection!.ranges[idx],
				nodes, tr.startState, backwards_select, group_select, is_selection, vim_mode);
			selections.push(cursor_operation.selection);
		}

		return tr.startState.update({
			selection: EditorSelection.create(selections),
			// TODO: Check if filter should only apply in vim mode?
			filter: false,
		});
	}

	return tr;
}