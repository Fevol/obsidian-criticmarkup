import { type Editor, type MarkdownView, Platform } from 'obsidian';

import {type ECommand, EditMode} from '../../types';

import {
	CM_SuggestionTypes, selectionContainsRanges,
	acceptSuggestions, rejectSuggestions, mark_editor_ranges, rangeParser,
} from '../base';
import type CommentatorPlugin from '../../main';
import { commentGutter } from '../renderers/gutters';
import {
	editMode, editModeValue, editModeValueState,
	previewMode, previewModeState
} from "../settings";
import {getEditMode} from "./extensions/editing-modes";


export const suggestion_commands: (plugin: CommentatorPlugin) => ECommand[] = (plugin) => Object.entries(CM_SuggestionTypes).map(([text, type]) => ({
	id: `toggle-${text.toLowerCase()}`,
	name: `Mark as ${text}`,
	icon: text.toLowerCase(),
	editor_context: true,
	regular_callback: (editor: Editor, view: MarkdownView) => {
		mark_editor_ranges(editor, type, plugin.settings)
	},
}));

export const editor_commands: (plugin: CommentatorPlugin) => ECommand[] = (plugin) => [
	{
		id: 'accept-all-suggestions',
		name: 'Accept all suggestions',
		icon: 'check-check',
		editor_context: true,
		regular_callback: (editor: Editor, _) => {
			// TODO: Add warning is #ranges > 100 ('Are you sure you want to accept all suggestions?')
			editor.cm.dispatch(editor.cm.state.update({
				changes: acceptSuggestions(editor.cm.state),
			}));
		},
	}, {
		id: 'reject-all-suggestions',
		name: 'Reject all suggestions',
		icon: 'cross',
		editor_context: true,
		regular_callback: (editor: Editor, _) => {
			editor.cm.dispatch(editor.cm.state.update({
				changes: rejectSuggestions(editor.cm.state),
			}));
		},
	},
	{
		id: 'accept-selected-suggestions',
		name: 'Accept suggestions in selection',
		icon: 'check',
		editor_context: true,
		check_callback: (checking: boolean, editor: Editor, _) => {
			const contains_range = selectionContainsRanges(editor.cm.state);
			if (checking || !contains_range)
				return contains_range;
			const selections = editor.cm.state.selection.ranges;
			const changes = selections.map(selection => acceptSuggestions(editor.cm.state, selection.from, selection.to));
			editor.cm.dispatch(editor.cm.state.update({
				changes,
			}));
		},
	},
	{
		id: 'reject-selected-suggestions',
		name: 'Reject suggestions in selection',
		icon: 'cross',
		editor_context: true,
		check_callback: (checking: boolean, editor: Editor, _) => {
			const contains_range = selectionContainsRanges(editor.cm.state);
			if (checking || !contains_range)
				return contains_range;
			const selections = editor.cm.state.selection.ranges;
			const changes = selections.map(selection => rejectSuggestions(editor.cm.state, selection.from, selection.to));
			editor.cm.dispatch(editor.cm.state.update({
				changes,
			}));
		},
	},
	{
		id: 'comment',
		name: 'Add comment',
		icon: 'message-square',
		editor_context: true,
		regular_callback: (editor: Editor, _) => {
			let cursor = editor.cm.state.selection.main.from;
			const ranges = editor.cm.state.field(rangeParser).ranges;
			const range = ranges.at_cursor(cursor);
			if (range)
				cursor = range.full_range_back;

			editor.cm.dispatch(editor.cm.state.update({
				changes: [{
					from: cursor,
					to: cursor,
					insert: '{>><<}',
				}],
			}));
			setTimeout(() => {
				editor.cm.plugin(commentGutter[1][0][0])!.focusCommentThread(cursor + 1);
			});
		}
	},
	{
		id: 'fold-gutter',
		name: 'Fold comment gutter',
		icon: 'arrow-right-from-line',
		editor_context: true,
		regular_callback: (editor: Editor, _) => {
			editor.cm.plugin(commentGutter[1][0][0])!.foldGutter();
		}
	},
	{
		id: 'toggle-preview-mode',
		name: 'Toggle preview mode',
		icon: 'comment',
		editor_context: true,
		regular_callback: (editor: Editor, _) => {
			editor.cm.dispatch(editor.cm.state.update({
				effects: previewMode.reconfigure((previewModeState.of((editor.cm.state.facet(previewModeState) + 1) % 3))),
			}));
		},
	},
	{
		id: 'suggest-mode',
		name: 'Toggle suggestion mode',
		icon: 'comment',
		editor_context: true,
		regular_callback: (editor: Editor, _) => {
			const current_value = editor.cm.state.facet(editModeValueState);
			const resulting_mode = current_value === EditMode.SUGGEST ? EditMode.CORRECTED : EditMode.SUGGEST;
			editor.cm.dispatch(editor.cm.state.update({
				effects: [
					editModeValue.reconfigure(editModeValueState.of(resulting_mode)),
					editMode.reconfigure(getEditMode(resulting_mode, plugin.settings))
				]
			}))

		},
	},
];

export const application_commmands = (plugin: CommentatorPlugin): ECommand[] => [
	{
		id: 'toggle-vim',
		name: '(DEBUG) Toggle Vim mode',
		icon: 'comment',
		regular_callback: async () => {
			plugin.app.vault.setConfig('vimMode', !plugin.app.vault.getConfig('vimMode'));
		},
	},
	{
		id: 'view',
		name: 'Open CriticMarkup view',
		icon: 'comment',
		regular_callback: async () => {
			await plugin.activateView();
		},
	}
];


/**
 * Automatically assigns correct callback to commands
 * @param commands Commands to initialize
 * @remark This results in non-editor callback commands also being available in the mobile toolbar
 */
export function initializeCommands(commands: ECommand[]) {
	for (const command of commands) {
		if (Platform.isMobile || command.editor_context) {
			if (command.regular_callback) {
				command.editorCallback = command.regular_callback;
				delete command.regular_callback;
			} else {
				command.editorCheckCallback = command.check_callback;
				delete command.check_callback;
			}
		} else {
			if (command.regular_callback) {
				command.callback = command.regular_callback;
				delete command.regular_callback;
			} else {
				command.checkCallback = command.check_callback;
				delete command.check_callback;
			}
		}
	}
}
