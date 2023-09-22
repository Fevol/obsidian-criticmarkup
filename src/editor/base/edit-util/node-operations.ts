import { Transaction } from '@codemirror/state';

import { getEditorRanges } from './selection-logic';
import { CriticMarkupNode, CriticMarkupNodes } from '../nodes';


function compareChanges(previous: CriticMarkupNodes, current: CriticMarkupNodes, tr: Transaction): {
	removed: CriticMarkupNode[], added: CriticMarkupNode[]
} {
	const removed: CriticMarkupNode[] = [];
	const added: CriticMarkupNode[] = [];

	const changes = getEditorRanges(tr.changes, tr.startState.doc);
	let offset = 0;

	for (const change of changes) {
		const current_offset = change.offset.added - change.offset.removed;
		const nodes_affected = previous.nodes_in_range(change.from, change.to);
		const new_nodes = current.nodes_in_range(change.from + offset, change.to + current_offset + offset);

		if (nodes_affected.length)
			removed.push(...nodes_affected);
		if (new_nodes.length)
			added.push(...new_nodes);

		offset += current_offset;
	}

	return { removed, added };
}

export function applyToText(text: string, fn: (node: CriticMarkupNode, text: string) => string, nodes: CriticMarkupNode[]) {
	let output = '';
	let last_node = 0;
	for (const node of nodes) {
		output += text.slice(last_node, node.from) + fn(node, text);
		last_node = node.to;
	}
	return output + text.slice(last_node);
}
