import {EditorSelection, EditorState, type Extension, SelectionRange, Transaction} from '@codemirror/state';
import {type PluginSettings} from '../../../../types';

import {
	cursorMoved,
	getEditorRanges,
	getUserEvents,
	is_forward_movement, MetadataFields,
	rangeParser,
	SuggestionType,
	text_delete,
	text_replace
} from '../../../base';


import {cursor_move} from "../../../base/suggestion-handler/movement";
import {
	METADATA_MERGE_OPTION,
	MetadataDifferenceOptions,
	text_insert
} from "../../../base/suggestion-handler/insert";
import {latest_keypress} from "../keypress-catcher";
import {Notice} from "obsidian";


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

// TODO: Actions to verify:
// 	{ keys: 'h', motion: 'moveByCharacters',
// 	{ keys: 'l', motion: 'moveByCharacters',
// 	{ keys: 'j', motion: 'moveByLines',
// 	{ keys: 'k', motion: 'moveByLines',
// 	{ keys: 'H', motion: 'moveToTopLine',
// 	{ keys: 'M', motion: 'moveToMiddleLine',
// 	{ keys: 'L', motion: 'moveToBottomLine',
// 	{ keys: 'gj', motion: 'moveByDisplayLines',
// 	{ keys: 'gk', motion: 'moveByDisplayLines',
// 	{ keys: 'w', motion: 'moveByWords',
// 	{ keys: 'W', motion: 'moveByWords',
// 	{ keys: 'e', motion: 'moveByWords',
// 	{ keys: 'E', motion: 'moveByWords',
// 	{ keys: 'b', motion: 'moveByWords',
// 	{ keys: 'B', motion: 'moveByWords',
// 	{ keys: 'ge', motion: 'moveByWords',
// 	{ keys: 'gE', motion: 'moveByWords',
// 	{ keys: '{', motion: 'moveByParagraph',
// 	{ keys: '}', motion: 'moveByParagraph',
// 	{ keys: '(', motion: 'moveBySentence',
// 	{ keys: ')', motion: 'moveBySentence',
// 	{ keys: '<C-f>', motion: 'moveByPage',
// 	{ keys: '<C-b>', motion: 'moveByPage',
// 	{ keys: '<C-d>', motion: 'moveByScroll',
// 	{ keys: '<C-u>', motion: 'moveByScroll',
// 	{ keys: 'gg', motion: 'moveToLineOrEdgeOfDocument',
// 	{ keys: 'G', motion: 'moveToLineOrEdgeOfDocument',
// 	{ keys: "g$", type: "motion", motion: "moveToEndOfDisplayLine"},
// 	{ keys: "g^", type: "motion", motion: "moveToStartOfDisplayLine"},
// 	{ keys: "g0", type: "motion", motion: "moveToStartOfDisplayLine"},
// 	{ keys: '0', motion: 'moveToStartOfLine' },
// 	{ keys: '^', motion: 'moveToFirstNonWhiteSpaceCharacter' },
// 	{ keys: '+', motion: 'moveByLines',
// 	{ keys: '-', motion: 'moveByLines',
// 	{ keys: '_', motion: 'moveByLines',
// 	{ keys: '$', motion: 'moveToEol',
// 	{ keys: '%', motion: 'moveToMatchedSymbol',
// 	{ keys: 'f<character>', motion: 'moveToCharacter',
// 	{ keys: 'F<character>', motion: 'moveToCharacter',
// 	{ keys: 't<character>', motion: 'moveTillCharacter',
// 	{ keys: 'T<character>', motion: 'moveTillCharacter',
// 	{ keys: ';', motion: 'repeatLastCharacterSearch',
// 	{ keys: ',', motion: 'repeatLastCharacterSearch',
// 	{ keys: '\'<character>', motion: 'goToMark',
// 	{ keys: '`<character>', motion: 'goToMark',
// 	{ keys: ']`', motion: 'jumpToMark',
// 	{ keys: '[`', motion: 'jumpToMark',
// 	{ keys: ']\'', motion: 'jumpToMark',
// 	{ keys: '[\'', motion: 'jumpToMark',
// 	{ keys: ']<character>', motion: 'moveToSymbol',
// 	{ keys: '[<character>', motion: 'moveToSymbol',
// 	{ keys: '|', motion: 'moveToColumn'},
// 	{ keys: 'o', motion: 'moveToOtherHighlightedEnd', context:'visual'},
// 	{ keys: 'O', motion: 'moveToOtherHighlightedEnd',
// 	'moveToLineOrEdgeOfDocument':


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

		const ranges = tr.startState.field(rangeParser).ranges;
		const changes = [];
		const selections: SelectionRange[] = [];


		const metadatamergeoptions: MetadataDifferenceOptions = {
			"author": METADATA_MERGE_OPTION.MOVE_OUTSIDE,
			"date": METADATA_MERGE_OPTION.NEW,
			"completed": METADATA_MERGE_OPTION.NEW,
			"urgency": METADATA_MERGE_OPTION.NEW,
			"style": METADATA_MERGE_OPTION.NEW,
		}

		let metadata: MetadataFields | undefined = {
			// "author": "Fevol",
		}

		let edit_info;

		if (Object.keys(metadata).length === 0)
			metadata = undefined;

		if (operation_type === OperationType.INSERTION) {
			let offset = 0;

			for (const range of changed_ranges) {
				// TODO: Sequential updates of same range (possible issues: multiple metadata inserts, multiple splits, ...)
				// 	Solutions:
				//		- Sequentially update the state with each editorchange (easiest)
				//		- Update ranges object with new changed/new ranges
				const insert_operation = text_insert(range, ranges, offset, SuggestionType.ADDITION,
					settings.suggestion_mode_operations.insert_text, metadata, metadatamergeoptions);
				if (insert_operation.debug) {
					if (insert_operation.debug.range) {
						const type = insert_operation.debug.metadata_type !== undefined ? 'metadata' : 'range';
						edit_info = `Skipping insert into range '${insert_operation.debug.range.text}' due to ${type} being of incompatible ${type}-type '${insert_operation.debug.metadata_type ?? insert_operation.debug.range.type}'`;
					} else {
						edit_info = `Cannot insert into regular text in this mode`;
					}
				} else {
					changes.push(...insert_operation.changes!);
					selections.push(insert_operation.selection!);
					offset = insert_operation.offset!;
				}
				// const insert_operation = text_insert(range, ranges, offset);
				// changes.push(...insert_operation.changes);
				// selections.push(insert_operation.selection);
				// offset = insert_operation.offset;
			}
		} else if (operation_type === OperationType.DELETION) {
			const userEvents = getUserEvents(tr);
			const backwards_delete = userEvents.includes('delete.backward') || userEvents.includes('delete.selection.backward');
			const group_delete = userEvents.includes('delete.group');
			const delete_selection = userEvents.includes('delete.selection');

			let offset = 0;
			for (const range of changed_ranges) {
				const delete_operation = text_delete(range, ranges, offset, tr.startState.doc, backwards_delete, group_delete, delete_selection, tr.startState);
				changes.push(...delete_operation.changes!);
				selections.push(delete_operation.selection!);
				offset = delete_operation.offset!;
			}
		} else if (operation_type === OperationType.REPLACEMENT) {
			let offset = 0;
			for (const range of changed_ranges) {
				const replace_operation = text_replace(range, ranges, offset, tr.startState.doc);
				changes.push(...replace_operation.changes!);
				selections.push(replace_operation.selection!);
				offset = replace_operation.offset!;
			}
		}

		if (changes.length)
			return tr.startState.update({ changes, selection: EditorSelection.create(selections), });
		if (settings.edit_info && edit_info)
			new Notice(edit_info);
		return tr.startState.update({})
	}

	// Handle cursor movements
	else if (isUserEvent('select', userEvents) && cursorMoved(tr) && settings.alternative_cursor_movement /*&& tr.startState.field(editorLivePreviewField)*/) {
		// Pointer/Mouse selection does not need any further processing
		if (userEvents.includes('select.pointer'))
			return tr;

		let backwards_select = userEvents.includes('select.backward');
		let group_select = userEvents.includes('select.group');
		let is_selection = userEvents.includes('select.extend');
		if (!vim_mode && latest_keypress) {
			if (latest_keypress.key === 'ArrowLeft')
				backwards_select = true;
			else if (latest_keypress.key === 'ArrowRight')
				backwards_select = false;
			else
				backwards_select = !is_forward_movement(tr.startState.selection, tr.selection!);

			is_selection = latest_keypress.shiftKey;
			group_select = latest_keypress.ctrlKey || latest_keypress.metaKey;
		}


		const ranges = tr.startState.field(rangeParser).ranges;


		const selections: SelectionRange[] = [];
		// TODO: cursor_move is 2x slower compared to previous system, main slowdowns are presumably:
		//    1. Constant looping over all ranges to find range at index
		//    2. Use of string enums (probably)
		for (const [idx, range] of tr.selection!.ranges.entries()) {
			const cursor_operation = cursor_move(tr.startState.selection!.ranges[idx],
				range, ranges, !backwards_select, group_select, is_selection, vim_mode, tr.startState,
				settings.suggestion_mode_operations.cursor_movement, settings.suggestion_mode_operations.bracket_movement,
			)

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
