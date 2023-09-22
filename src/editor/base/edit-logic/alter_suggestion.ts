import { type ChangeSpec, EditorState } from '@codemirror/state';

import { type TFile } from 'obsidian';

import { CriticMarkupNode, NodeType } from '../nodes';
import { nodeParser, applyToText } from '../edit-util';

export function acceptSuggestions(state: EditorState, from?: number, to?: number): ChangeSpec[] {
	let nodes = state.field(nodeParser).nodes
	if (from || to)
		nodes = nodes.filter_range(from ?? 0, to ?? Infinity, true);

	return nodes.nodes
		.filter(node => node.type === NodeType.ADDITION || node.type === NodeType.DELETION || node.type === NodeType.SUBSTITUTION)
		.map(node => ({ from: node.from, to: node.to, insert: node.accept() }));
}

export async function acceptSuggestionsInFile(file: TFile, nodes: CriticMarkupNode[]) {
	nodes.sort((a, b) => a.from - b.from);
	const text = await app.vault.cachedRead(file);

	const output = applyToText(text, (node, text) => node.accept()!, nodes);

	await app.vault.modify(file, output);
}


export function rejectSuggestions(state: EditorState, from?: number, to?: number): ChangeSpec[] {
	let nodes = state.field(nodeParser).nodes;
	if (from || to)
		nodes = nodes.filter_range(from ?? 0, to ?? Infinity, true);

	return nodes.nodes
		.filter(node => node.type === NodeType.ADDITION || node.type === NodeType.DELETION || node.type === NodeType.SUBSTITUTION)
		.map(node => ({ from: node.from, to: node.to, insert: node.reject() }));
}

export async function rejectSuggestionsInFile(file: TFile, nodes: CriticMarkupNode[]) {
	nodes.sort((a, b) => a.from - b.from);
	const text = await app.vault.cachedRead(file);

	const output = applyToText(text, (node, text) => node.reject()!, nodes);

	await app.vault.modify(file, output);
}
