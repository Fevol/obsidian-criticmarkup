import { type Editor, type MarkdownView, Platform } from 'obsidian';

import { type ECommand } from '../../types';

import {
	CM_NodeTypes, selectionContainsNodes,
	changeType, acceptSuggestions, rejectSuggestions,
} from '../base';
import type CommentatorPlugin from '../../main';
import { commentGutter } from '../renderers/gutters';


export const suggestion_commands: ECommand[] = Object.entries(CM_NodeTypes).map(([text, type]) => ({
	id: `commentator-toggle-${text.toLowerCase()}`,
	name: `Mark as ${text}`,
	icon: text.toLowerCase(),
	editor_context: true,
	regular_callback: (editor: Editor, view: MarkdownView) => {
		changeType(editor, view, type);
	},
}));

export const editor_commands: ECommand[] = [
	{
		id: 'commentator-accept-all-suggestions',
		name: 'Accept all suggestions',
		icon: 'check-check',
		editor_context: true,
		regular_callback: (editor: Editor, _) => {
			// TODO: Add warning is #nodes > 100 ('Are you sure you want to accept all suggestions?')
			editor.cm.dispatch(editor.cm.state.update({
				changes: acceptSuggestions(editor.cm.state),
			}));
		},
	}, {
		id: 'commentator-reject-all-suggestions',
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
		id: 'commentator-accept-selected-suggestions',
		name: 'Accept suggestions in selection',
		icon: 'check',
		editor_context: true,
		check_callback: (checking: boolean, editor: Editor, _) => {
			const contains_node = selectionContainsNodes(editor.cm.state);
			if (checking || !contains_node)
				return contains_node;
			const selections = editor.cm.state.selection.ranges;
			const changes = selections.map(selection => acceptSuggestions(editor.cm.state, selection.from, selection.to));
			editor.cm.dispatch(editor.cm.state.update({
				changes,
			}));
		},
	},
	{
		id: 'commentator-reject-selected-suggestions',
		name: 'Reject suggestions in selection',
		icon: 'cross',
		editor_context: true,
		check_callback: (checking: boolean, editor: Editor, _) => {
			const contains_node = selectionContainsNodes(editor.cm.state);
			if (checking || !contains_node)
				return contains_node;
			const selections = editor.cm.state.selection.ranges;
			const changes = selections.map(selection => rejectSuggestions(editor.cm.state, selection.from, selection.to));
			editor.cm.dispatch(editor.cm.state.update({
				changes,
			}));
		},
	},
	{
		id: 'commentator-comment',
		name: 'Add comment',
		icon: 'message-square',
		editor_context: true,
		regular_callback: (editor: Editor, view: MarkdownView) => {
			const cursor = editor.cm.state.selection.main.from;
			editor.cm.dispatch(editor.cm.state.update({
				changes: [{
					from: cursor,
					to: cursor,
					insert: '{>><<}',
				}],
			}));
			setTimeout(() => {
				// @ts-expect-error (Directly accessing function of unexported class)
				editor.cm.plugin(commentGutter[1][0][0])!.focusCommentThread(cursor + 1);
			});
		}
	}
];

export const application_commmands = (plugin: CommentatorPlugin): ECommand[] => [
	{
		id: 'commentator-suggest-mode',
		name: 'Toggle suggestion mode',
		icon: 'comment',
		editor_context: true,
		regular_callback: async () => {
			plugin.settings.suggest_mode = !plugin.settings.suggest_mode;
			await plugin.saveSettings();
		},
	},
	{
		id: 'commentator-toggle-vim',
		name: '(DEBUG) Toggle Vim mode',
		icon: 'comment',
		regular_callback: async () => {
			plugin.app.vault.setConfig('vimMode', !plugin.app.vault.getConfig('vimMode'));
		},
	},
	{
		id: 'commentator-view',
		name: 'Open CriticMarkup view',
		icon: 'comment',
		regular_callback: async () => {
			await plugin.activateView();
		},
	},
	{
		id: 'commentator-toggle-preview-mode',
		name: 'Toggle preview mode',
		icon: 'comment',
		regular_callback: async () => {
			plugin.settings.preview_mode = (plugin.settings.preview_mode + 1) % 3;
			await plugin.saveSettings();
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
