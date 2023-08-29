import type { Editor, MarkdownView, TFile } from 'obsidian';

import { treeParser } from './tree-parser';

import type { ChangeSpec, SelectionRange } from '@codemirror/state';
import { EditorSelection, EditorState, Text } from '@codemirror/state';
import type { Tree } from '@lezer/common';

import { type ECommand, NodeType, type OperationReturn } from '../types';

import { applyToText, CM_All_Brackets, CM_NodeTypes } from '../util';
import { nodesInSelection, selectionContainsNodes, selectionToEditorRange } from './editor-util';
import { type CriticMarkupNode, CriticMarkupNodes } from './criticmarkup-nodes';
import { text_delete, text_replace } from './edit-logic';


export function changeSelectionType(text: Text, selection: SelectionRange, type: NodeType, nodes: CriticMarkupNodes, offset: number): OperationReturn {
	let selection_start = selection.from, selection_end = selection.to;
	const nodes_in_range = nodes.nodes_in_range(selection_start, selection_end);
	const unwrapped_text = nodes.unwrap_in_range(text, selection_start, selection_end, nodes_in_range);

	selection_start = unwrapped_text.from;
	selection_end = unwrapped_text.to;

	let start_offset = 0, end_offset = 0;


	let output_text = "";
	if (unwrapped_text.front_node) {
		if (unwrapped_text.front_node.type !== type) {
			output_text += CM_All_Brackets[unwrapped_text.front_node.type].at(-1);
			start_offset += 3;
			output_text += CM_All_Brackets[type].at(0);
		}
	} else {
		output_text += CM_All_Brackets[type].at(0);
	}
	output_text += unwrapped_text.output;


	if (unwrapped_text.back_node) {
		if (unwrapped_text.back_node.type !== type) {
			output_text += CM_All_Brackets[type].at(-1);
			end_offset -= 3;
			output_text += CM_All_Brackets[unwrapped_text.back_node.type].at(0);
		}
	} else {
		output_text += CM_All_Brackets[type].at(-1);
	}

	end_offset += output_text.length - (selection.to - selection.from)

	return {
		changes: [{
			from: selection_start,
			to: selection_end,
			insert: output_text,
		}],
		selection: EditorSelection.range(selection_start + start_offset + offset, selection_end + end_offset + offset),
		offset: output_text.length - (selection.to - selection.from),
	}
}


export function changeType(editor: Editor, view: MarkdownView, type: NodeType) {
	const tree: Tree = editor.cm.state.field(treeParser).tree;
	const nodes = nodesInSelection(tree);
	const text = editor.cm.state.doc;
	const editor_changes: ChangeSpec[] = [], selections: SelectionRange[] = [];


	let fn: (text: Text, sel: SelectionRange, type: NodeType, nodes: CriticMarkupNodes) => OperationReturn;
	let current_offset = 0;

	if (type === NodeType.DELETION) {
		fn = (text, sel, type, nodes) => {
			return text_delete(
				selectionToEditorRange(sel, text, true),
				nodes, current_offset, text, false, false,
				true, editor.cm.state, true
			);
		}
	} else if (type === NodeType.SUBSTITUTION) {
		fn = (text, sel, type, nodes) => {
			return text_replace(
				selectionToEditorRange(sel, text, true),
				nodes, current_offset, text
			)
		}
	} else {
		fn = (text, sel, type, nodes) => {
			return changeSelectionType(text, sel, type, nodes, current_offset);
		}
	}

	for (const sel of editor.cm.state.selection.ranges) {
		const {changes, selection, offset } = fn(text, sel, type, nodes);
		editor_changes.push(...changes);
		selections.push(selection);
		current_offset = offset;
	}

	editor.cm.dispatch(editor.cm.state.update({
		changes: editor_changes,
		selection: EditorSelection.create(selections),
	}));
}


export function acceptAllSuggestions(state: EditorState, from?: number, to?: number): ChangeSpec[] {
	const tree: Tree = state.field(treeParser).tree;
	const text = state.doc.toString();

	return nodesInSelection(tree, from, to).nodes
		.filter(node => node.type === NodeType.ADDITION || node.type === NodeType.DELETION || node.type === NodeType.SUBSTITUTION)
		.map(node => ({ from: node.from, to: node.to, insert: node.accept(text) }));
}

export async function acceptSuggestionsInFile(file: TFile, nodes: CriticMarkupNode[]) {
	nodes.sort((a, b) => a.from - b.from);
	const text = await app.vault.cachedRead(file);

	const output = applyToText(text, (node, text) => node.accept(text), nodes);

	await app.vault.modify(file, output);
}


export function rejectAllSuggestions(state: EditorState, from?: number, to?: number): ChangeSpec[] {
	const tree: Tree = state.field(treeParser).tree;
	const text = state.doc.toString();

	return nodesInSelection(tree, from, to).nodes
		.filter(node => node.type === NodeType.ADDITION || node.type === NodeType.DELETION || node.type === NodeType.SUBSTITUTION)
		.map(node => ({ from: node.from, to: node.to, insert: node.reject(text) }));
}

export async function rejectSuggestionsInFile(file: TFile, nodes: CriticMarkupNode[]) {
	nodes.sort((a, b) => a.from - b.from);
	const text = await app.vault.cachedRead(file);

	const output = applyToText(text, (node, text) => node.reject(text), nodes);

	await app.vault.modify(file, output);
}


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
				changes: acceptAllSuggestions(editor.cm.state),
			}));
		},
	}, {
		id: 'commentator-reject-all-suggestions',
		name: 'Reject all suggestions',
		icon: 'cross',
		editor_context: true,
		regular_callback: (editor: Editor, _) => {
			editor.cm.dispatch(editor.cm.state.update({
				changes: rejectAllSuggestions(editor.cm.state),
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
			const changes = selections.map(selection => acceptAllSuggestions(editor.cm.state, selection.from, selection.to));
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
			const changes = selections.map(selection => rejectAllSuggestions(editor.cm.state, selection.from, selection.to));
			editor.cm.dispatch(editor.cm.state.update({
				changes,
			}));
		},
	}
];
