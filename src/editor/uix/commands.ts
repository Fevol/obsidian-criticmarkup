import type { Editor, MarkdownView } from 'obsidian';

import { type ECommand } from '../../types';

import {
	CM_NodeTypes, selectionContainsNodes,
	changeType, acceptSuggestions, rejectSuggestions,
} from '../base';


const suggestion_commands: ECommand[] = Object.entries(CM_NodeTypes).map(([text, type]) => ({
	id: `commentator-toggle-${text.toLowerCase()}`,
	name: `Mark as ${text}`,
	icon: text.toLowerCase(),
	editor_context: true,
	regular_callback: (editor: Editor, view: MarkdownView) => {
		changeType(editor, view, type);
	},
}));


export const commands: ECommand[] = [...suggestion_commands,
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
];
