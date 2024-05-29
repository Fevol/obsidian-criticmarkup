import {EditorSelection, EditorState, type Extension, SelectionRange, Transaction} from '@codemirror/state';
import {type PluginSettings} from '../../../../types';

import {
	cursor_move_range,
	cursorMoved,
	generate_metadata,
	getEditorRanges,
	getUserEvents,
	mark_ranges,
	MarkAction,
	MarkType, range_metadata_compatible,
	rangeParser, SubstitutionRange,
	SuggestionType
} from '../../../base';

import {latest_event} from "../keypress-catcher";
import {cursor_transaction_pass_syntax} from "./cursor_movement";
import {COMMENTATOR_GLOBAL} from "../../../../global";


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
	const vim_mode = COMMENTATOR_GLOBAL.app.workspace.activeEditor?.editor?.cm.cm !== undefined;

	// TODO: Resolve used vim cursor movements since they do not receive user event annotations
	if (!tr.docChanged && tr.selection && vim_mode) {
		if (cursorMoved(tr))
			userEvents.push(tr.startState.selection.ranges[0].from < tr.selection!.ranges[0].from ? 'select.forward' : 'select.backward');
		if (vim_action_resolver[COMMENTATOR_GLOBAL.app.workspace.activeEditor?.editor?.cm.cm?.state.vim.lastMotion?.name as keyof typeof vim_action_resolver]?.group)
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
		// TODO: Dragging and dropping a selection also doesn't seem to fire a userEvent
		if (!is_recognized_edit_operation)
			return tr;

		const ranges = tr.startState.field(rangeParser).ranges;
		const changes = [];
		const selections: SelectionRange[] = [];


		const metadata = generate_metadata();

		const backwards_delete = (latest_event as KeyboardEvent)?.key === "Backspace";
		const group_delete = (latest_event as KeyboardEvent)?.ctrlKey;
		let offset = 0;
		// TODO: Consider each editor_change separately to avoid issues where you try to re-insert into a now updated range
		//        (Or: update ranges with editor_change to reflect the new state)
		for (let editor_change of changed_ranges) {
			let type: MarkType = editor_change.deleted ? (editor_change.inserted ? SuggestionType.SUBSTITUTION : SuggestionType.DELETION) : SuggestionType.ADDITION;
			if (type === SuggestionType.DELETION) {
				editor_change = cursor_move_range(editor_change, ranges, backwards_delete, group_delete, tr.startState,
					settings.suggestion_mode_operations.cursor_movement, settings.suggestion_mode_operations.bracket_movement);

				const ranges_in_range = ranges.ranges_in_range(editor_change.from, editor_change.to);
				if (ranges_in_range.length === 1) {
					const range = ranges_in_range[0];
					if (range.encloses_range(editor_change.from, editor_change.to) && range_metadata_compatible(range, metadata) &&
						(range.type === SuggestionType.ADDITION ||
						(range.type === SuggestionType.SUBSTITUTION && (range as SubstitutionRange).contains_part(editor_change.from, editor_change.to, false)) === false)
					) {
						type = MarkAction.REGULAR;
					}
				}


			}

			const edits = mark_ranges(ranges, tr.startState.doc, editor_change.from, editor_change.to, editor_change.inserted, type, metadata);
			const added_offset = edits.slice(0, -1).reduce((acc, op) => acc - (op.to - op.from) + op.insert.length, 0);
			if (edits) {
				changes.push(edits);
				selections.push(EditorSelection.cursor((backwards_delete ? edits[0].start : edits[edits.length - 1].end + added_offset) + offset));
				offset += added_offset - (edits[edits.length - 1].to - edits[edits.length - 1].from) + edits[edits.length - 1].insert.length
			}
		}

		return tr.startState.update(changes.length ? { changes, selection: EditorSelection.create(selections)} : {});
	}

	// CASE 2: Handle cursor movements
	else if (isUserEvent('select', userEvents) && cursorMoved(tr) && settings.alternative_cursor_movement /*&& tr.startState.field(editorLivePreviewField)*/) {
		if (latest_event instanceof KeyboardEvent) {
			const result = cursor_transaction_pass_syntax(tr, userEvents, vim_mode, settings, latest_event);
			if (result)
				return tr.startState.update(result);
		}
	}

	return tr;
}
