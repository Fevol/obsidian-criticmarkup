import type { CommandI } from '../../types';
import type { Editor, EditorChange, EditorTransaction, MarkdownView } from 'obsidian';

import type { Tree } from '@lezer/common';

import { criticmarkupLanguage } from './parser';
import { addBracket, unwrapBracket, wrapBracket } from '../constants';
import { ltEP, minEP, maxEP, nodesInSelection, selectionToRange } from './util';
import type { ChangeSpec } from '@codemirror/state';
import { ChangeSet } from '@codemirror/state';


function changeSelectionType(editor: Editor, view: MarkdownView, type: string) {
	// @ts-ignore
	const tree: Tree = criticmarkupLanguage.parser.parse(editor.getValue(), []);

	const selection = editor.listSelections()[0];
	if (!selection) return;

	let selection_start = minEP(selection.head, selection.anchor);
	let selection_end = maxEP(selection.head, selection.anchor);

	const selection_left = editor.posToOffset(selection_start);
	const selection_right = editor.posToOffset(selection_end);

	const nodes = nodesInSelection(tree, selection_left, selection_right);


	// CASE 1: Selection is not in a CriticMarkup node
	if (!nodes.length) {
		editor.replaceSelection(wrapBracket(editor.getSelection(), type));
	}
	// CASE 2: Selection is (partially/fully) inside CriticMarkup nodes
	else {
		let in_selection = '';
		let left_unselected_node = '', right_unselected_node = '';


		// Error case: if only a bracket is selected, do nothing
		if (selection_right - selection_left <= 3 &&
			((selection_right <= nodes[0].from + 3 && selection_left >= nodes[0].from) ||
				(selection_left >= nodes[nodes.length - 1].to - 3 && selection_right <= nodes[nodes.length - 1].to))) {
			return;
		}


		const selected_left_bracket = selection_left <= nodes[0].from + 3;
		const selected_right_bracket = selection_right >= nodes[nodes.length - 1].to - 3;
		const outside_left_bracket = selection_left < nodes[0].from;
		const outside_right_bracket = selection_right > nodes[nodes.length - 1].to;

		let all_same_type = true;

		// CASE 2.1: Fully selected CriticMarkup nodes
		if (!(outside_left_bracket || outside_right_bracket) && selected_left_bracket && selected_right_bracket) {
			console.log('CASE 2.1');
			for (let i = 0; i < nodes.length; i++) {
				in_selection += unwrapBracket(editor.getRange(editor.offsetToPos(nodes[i].from), editor.offsetToPos(nodes[i].to)));
				all_same_type &&= nodes[i].type === type;
			}
			// OPTION 1: All nodes are of the same type
			// {++ Selection ++} -> Selection

			// OPTION 2: Nodes are of different types
			// {++ Selection ++}{-- Selection --} -> {++ Selection  Selection ++}
			editor.replaceRange(all_same_type ? in_selection : wrapBracket(in_selection, type),
				editor.offsetToPos(nodes[0].from), editor.offsetToPos(nodes[nodes.length - 1].to));

		}

		// CASE 2.2: Partially selected CriticMarkup node
		else if (nodes.length === 1 && selection_left >= nodes[0].from && selection_right <= nodes[0].to) {
			console.log('CASE 2.2');
			const node = nodes[0];

			const node_start = editor.offsetToPos(node.from), node_end = editor.offsetToPos(node.to);

			// OPTION 1: Unmark entire node (if type same)
			// if (node.type === type) {
			// 	// {++ Text Selection Text ++} -> Text Selection Text
			// 	// editor.replaceRange(unwrapBracket(editor.getRange(node_start, node_end)), node_start, node_end);
			// }

			// OPTION 2: (Un)mark part of node
			// {++ Text Selection Text ++} -> {++ Text ++} Selection {++ Text ++}
			// {-- Text Selection Text --} -> {-- Text --} {++ Selection ++} {-- Text --}

			let left_unselected = '', middle_selection = '', right_unselected = '';

			if (selected_left_bracket)
				selection_start = editor.offsetToPos(node.from + 3);
			else
				left_unselected = addBracket(editor.getRange(node_start, selection_start), node.type, false);
			if (selected_right_bracket)
				selection_end = editor.offsetToPos(node.to - 3);
			else
				right_unselected = addBracket(editor.getRange(selection_end, node_end), node.type, true);
			if (ltEP(selection_start, selection_end)) {
				middle_selection = editor.getRange(selection_start, selection_end);
				if (node.type !== type)
					middle_selection = wrapBracket(middle_selection, type);
			}

			editor.replaceRange(left_unselected + middle_selection + right_unselected, node_start, node_end);

		}
		// CASE 2.3: Selection only includes right bracket of other node
		else if (outside_left_bracket && selected_left_bracket && nodes[0].from + 3 >= selection_right) {
			console.log('CASE 2.3');
			const node = nodes[0];

			const outside_node_content = editor.getRange(selection_start, editor.offsetToPos(node.from));

			if (node.type === type) {
				// Selection {++ Text ++}  -> {++ Selection Text ++}
				const content = wrapBracket(outside_node_content +
					unwrapBracket(editor.getRange(editor.offsetToPos(node.from), editor.offsetToPos(node.to))), type);
				editor.replaceRange(content, selection_start, editor.offsetToPos(node.to));
			} else {
				editor.replaceRange(wrapBracket(outside_node_content, type), selection_start, editor.offsetToPos(node.from));
			}
		}

		// CASE 2.4: Selection only includes left bracket of other node
		else if (outside_right_bracket && selected_right_bracket && nodes[nodes.length - 1].to - 3 <= selection_left) {
			console.log('CASE 2.4');
			const node = nodes[nodes.length - 1];

			const outside_node_content = editor.getRange(editor.offsetToPos(node.to), selection_end);
			if (node.type === type) {
				// {++ Text ++} Selection  -> {++ Text Selection ++}
				const content = wrapBracket(unwrapBracket(editor.getRange(editor.offsetToPos(node.from), editor.offsetToPos(node.to))) +
					outside_node_content, type);
				editor.replaceRange(content, editor.offsetToPos(node.from), selection_end);
			} else {
				editor.replaceRange(wrapBracket(outside_node_content, type), editor.offsetToPos(node.to), selection_end);
			}
		}


		// CASE 2.5: Selection is over multiple nodes
		else {
			console.log('CASE 2.5');
			const unselected_left_outside = editor.getRange(editor.offsetToPos(selection_left), editor.offsetToPos(nodes[0].from));
			const unselected_right_outside = editor.getRange(editor.offsetToPos(nodes[nodes.length - 1].to), editor.offsetToPos(selection_right));

			in_selection += unselected_left_outside;

			const start_range = minEP(selection_start, editor.offsetToPos(nodes[0].from)),
				end_range = maxEP(selection_end, editor.offsetToPos(nodes[nodes.length - 1].to));


			for (const [i, node] of nodes.entries()) {
				let node_content = unwrapBracket(editor.getRange(editor.offsetToPos(node.from), editor.offsetToPos(node.to)));

				// Handles cases where selection is partially within node of other type
				// {-- Text Sel --} ection -> {-- Text --} {++ Sel ection ++}
				if (i === 0) {
					if (type !== node.type && selection_left > node.from + 3) {
						const node_split = selection_left - node.from - 3;
						left_unselected_node = wrapBracket(node_content.slice(0, node_split), node.type);
						node_content = node_content.slice(node_split);
					}
				} else if (i === nodes.length - 1) {
					if (type !== node.type && selection_right < node.to - 3) {
						const node_split = selection_right - node.from - 3;
						right_unselected_node = wrapBracket(node_content.slice(node_split), node.type);
						node_content = node_content.slice(0, node_split);
					}
				}
				in_selection += node_content;

				if (i < nodes.length - 1 && nodes[i + 1].from - node.to > 0) {
					const text_between_nodes = editor.getRange(editor.offsetToPos(node.to), editor.offsetToPos(nodes[i + 1].from));
					if (text_between_nodes) {
						in_selection += text_between_nodes;
					}
				}

			}

			in_selection += unselected_right_outside;

			editor.replaceRange(left_unselected_node + wrapBracket(in_selection, type) + right_unselected_node,
				start_range, end_range);
		}
	}
}


export function acceptAllSuggestions(text: string, from?: number, to?: number): ChangeSpec[] {
	// @ts-ignore
	const tree: Tree = criticmarkupLanguage.parser.parse(text, []);
	const nodes = nodesInSelection(tree, from, to);
	const changes: ChangeSpec[] = [];
	for (const node of nodes) {
		if (node.type === 'Addition')
			changes.push({ from: node.from, to: node.to, insert: unwrapBracket(text.slice(node.from, node.to)) });
		else if (node.type === 'Deletion')
			changes.push({ from: node.from, to: node.to, insert: '' });
		else if (node.type === 'Substitution')
			changes.push({ from: node.from, to: node.to, insert: unwrapBracket(text.slice(node.from, node.to)) });
	}
	return changes;
}


export function rejectAllSuggestions(text: string, from?: number, to?: number): ChangeSpec[] {
	// @ts-ignore
	const tree: Tree = criticmarkupLanguage.parser.parse(text, []);
	const nodes = nodesInSelection(tree, from, to).reverse();
	const changes: ChangeSpec[] = [];
	for (const node of nodes) {
		if (node.type === 'Addition')
			changes.push({ from: node.from, to: node.to, insert: '' });
		else if (node.type === 'Deletion')
			changes.push({ from: node.from, to: node.to, insert: unwrapBracket(text.slice(node.from, node.to)) });
		else if (node.type === 'Substitution')
			changes.push({ from: node.from, to: node.to, insert: '' });
	}
	return changes;
}


const suggestion_commands = ['Addition', 'Deletion', 'Substitution', 'Comment', 'Highlight'].map(type => ({
	id: `commentator-toggle-${type.toLowerCase()}`,
	name: `Mark as ${type}`,
	icon: type.toLowerCase(),
	editor_context: true,
	callback: async (editor: Editor, view: MarkdownView) => {
		changeSelectionType(editor, view, type);
	},
}));


export const commands: Array<CommandI> = [...suggestion_commands,
	{
		id: 'commentator-accept-all-suggestions',
		name: 'Accept all suggestions',
		icon: 'check-check',
		editor_context: true,
		callback: async (editor: Editor, view: MarkdownView) => {
			// @ts-ignore (editor.cm.dispatch exists)
			editor.cm.dispatch(editor.cm.state.update({
				changes: acceptAllSuggestions(editor.getValue()),
			}));
		},
	}, {
		id: 'commentator-reject-all-suggestions',
		name: 'Reject all suggestions',
		icon: 'cross',
		editor_context: true,
		callback: async (editor: Editor, view: MarkdownView) => {
			// @ts-ignore (editor.cm.dispatch exists)
			editor.cm.dispatch(editor.cm.state.update({
				changes: rejectAllSuggestions(editor.getValue()),
			}));
		},
	},
	{
		id: 'commentator-accept-selected-suggestions',
		name: 'Accept suggestions in selection',
		icon: 'check',
		editor_context: true,
		callback: async (editor: Editor, view: MarkdownView) => {
			const [from, to] = selectionToRange(editor);
			// @ts-ignore (editor.cm.dispatch exists)
			editor.cm.dispatch(editor.cm.state.update({
				changes: acceptAllSuggestions(editor.getValue(), from, to),
			}));
		}
	},
	{
		id: 'commentator-reject-selected-suggestions',
		name: 'Reject suggestions in selection',
		icon: 'cross',
		editor_context: true,
		callback: async (editor: Editor, view: MarkdownView) => {
			const [from, to] = selectionToRange(editor);
			// @ts-ignore (editor.cm.dispatch exists)
			editor.cm.dispatch(editor.cm.state.update({
				changes: rejectAllSuggestions(editor.getValue(), from, to),
			}));
		}
	}
];