import {EditorSelection, EditorState, type Extension, SelectionRange, Transaction} from '@codemirror/state';
import {type PluginSettings} from '../../../../types';

import {
	cursor_move_range,
	cursorMoved,
	getEditorRanges,
	getUserEvents,
	is_forward_movement, mark_ranges, MarkType,
	rangeParser,
	SuggestionType,
	cursor_move,
	MarkAction,
	generate_metadata
} from '../../../base';

import {latest_keypress} from "../keypress-catcher";


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


export const suggestionMode = (settings: PluginSettings): Extension => EditorState.transactionFilter.of(tr => applySuggestion(tr, settings));


// TODO: Functionality: Double click mouse should also floodfill (problem: no specific userevent attached)
function applySuggestion(tr: Transaction, settings: PluginSettings): Transaction {
	const userEvents = getUserEvents(tr);
	const vim_mode = app.workspace.activeEditor?.editor?.cm.cm !== undefined;

	// TODO: Resolve used vim cursor movements since they do not receive user event annotations
	if (!tr.docChanged && tr.selection && vim_mode) {
		if (cursorMoved(tr))
			userEvents.push(tr.startState.selection.ranges[0].from < tr.selection!.ranges[0].from ? 'select.forward' : 'select.backward');
		if (vim_action_resolver[app.workspace.activeEditor?.editor?.cm.cm?.state.vim.lastMotion?.name as keyof typeof vim_action_resolver]?.group)
			userEvents.push('select.group');
	}


	// CASE 1: Handle edit operations
	if (tr.docChanged) {
		const changed_ranges = getEditorRanges(tr.startState.selection, tr.changes, tr.startState.doc);

		const is_recognized_edit_operation = tr.isUserEvent('input') || tr.isUserEvent('paste') || tr.isUserEvent('delete');

		// ISSUE: Pasting an image yields no userEvent that could be used to determine the type, so the
		//      operation type needs to be determined via the changed ranges. However, a change of the state
		//      *will* result in the new transaction being filtered through the suggestion mode filter again (recursion)
		// TODO: Currently, a only transactions with valid userEvents editevents considered
		//       Somehow, someway, image pastes need to get an userevent attached (monkey-around insertFiles?)
		if (!is_recognized_edit_operation)
			return tr;

		const ranges = tr.startState.field(rangeParser).ranges;
		const changes = [];
		const selections: SelectionRange[] = [];


		const metadata = generate_metadata(settings);

		const alt_mode = settings.edit_ranges ? MarkAction.REGULAR : undefined;

		const backwards_delete = latest_keypress?.key === "Backspace";
		const group_delete = latest_keypress?.ctrlKey!;
		let offset = 0;
		// TODO: Consider each editor_change separately to avoid issues where you try to re-insert into a now updated range
		//        (Or: update ranges with editor_change to reflect the new state)
		for (let editor_change of changed_ranges) {
			let type: MarkType = editor_change.deleted ? (editor_change.inserted ? SuggestionType.SUBSTITUTION : SuggestionType.DELETION) : SuggestionType.ADDITION;
			if (type === SuggestionType.DELETION) {
				editor_change = cursor_move_range(editor_change, ranges, backwards_delete, group_delete, tr.startState,
					settings.suggestion_mode_operations.cursor_movement, settings.suggestion_mode_operations.bracket_movement);
			}
			type = alt_mode ?? type;

			const edits = mark_ranges(ranges, tr.startState.doc, editor_change.from, editor_change.to, editor_change.inserted, type, metadata);
			const added_offset = edits.slice(0, -1).reduce((acc, op) => acc - (op.to - op.from) + op.insert.length, 0);
			if (edits) {
				changes.push(edits);
				selections.push(EditorSelection.cursor((backwards_delete ? edits[0].start : edits[edits.length - 1].end + added_offset) + offset));
				offset += added_offset - (edits[edits.length - 1].to - edits[edits.length - 1].from) + edits[edits.length - 1].insert.length
			}
		}

		if (changes.length)
			return tr.startState.update({ changes, selection: EditorSelection.create(selections), });
		return tr.startState.update({})
	}

	// CASE 2: Handle cursor movements
	else if (isUserEvent('select', userEvents) && cursorMoved(tr) && settings.alternative_cursor_movement /*&& tr.startState.field(editorLivePreviewField)*/) {
		// NOTE: Pointer/Mouse selection does not need any further processing (allows for debugging)
		if (userEvents.includes('select.pointer') || (latest_keypress && (latest_keypress.key === "a" && (latest_keypress.ctrlKey || latest_keypress.metaKey))))
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
