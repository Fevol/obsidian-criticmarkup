import { EditorState, StateField } from '@codemirror/state';
import { type ChangedRange, type Tree, TreeFragment } from '@lezer/common';

import { constructNode, CriticMarkupNode, CriticMarkupNodes } from '../nodes';

import { criticmarkupLanguage } from '../../parser';

export const nodeParser: StateField<{tree: Tree, fragments: readonly TreeFragment[], nodes: CriticMarkupNodes}> = StateField.define({
	create(state) {
		const text = state.doc.toString();
		const tree = criticmarkupLanguage.parser.parse(text);
		const fragments = TreeFragment.addTree(tree);
		const nodes = nodesInSelection(tree, text);

		return { tree, nodes, fragments }
	},

	// @ts-ignore (Not sure how to set fragments as readonly)
	update(value, tr) {
		if (!tr.docChanged) return value;

		const changed_ranges: ChangedRange[] = [];
		tr.changes.iterChangedRanges((from, to, fromB, toB) =>
			changed_ranges.push({fromA: from, toA: to, fromB: fromB, toB: toB})
		);

		let fragments = TreeFragment.applyChanges(value.fragments, changed_ranges);

		const text = tr.state.doc.toString();
		const tree = criticmarkupLanguage.parser.parse(text, fragments);
		fragments = TreeFragment.addTree(tree, fragments);
		const nodes = nodesInSelection(tree, text);

		return { tree, nodes, fragments }
	},
});

export function nodesInSelection(tree: Tree, text: string, start?: number, end?: number) {
	const nodes: CriticMarkupNode[] = [];

	tree.iterate({
		from: start,
		to: end,
		enter: (node) => {
			// FIXME: Add check here whether [node.to - 3, node.to] is in fact a bracket, prevent half-open nodes from actually being considered as nodes
			if (node.type.name === '⚠')
				return false;
			if (node.type.name === 'CriticMarkup' || node.type.name === 'MSub')
				return;
			if (node.type.name === 'Substitution') {
				if (node.node.firstChild?.type.name !== 'MSub')
					return;
				nodes.push(constructNode(node.from, node.to, node.type.name, text.slice(node.from, node.to), node.node.firstChild?.from)!);
			} else {
				nodes.push(constructNode(node.from, node.to, node.type.name, text.slice(node.from, node.to), node.node.firstChild?.from)!);
			}
		},
	});
	return new CriticMarkupNodes(nodes);
}

export function selectionContainsNodes(state: EditorState) {
	const nodes = state.field(nodeParser).nodes;
	return nodes.nodes.length ? state.selection.ranges.some(range =>
		nodes.range_contains_node(range.from, range.to),
	) : false;
}

export function getNodesInText(text: string, from?: number, to?: number) {
	const tree = criticmarkupLanguage.parser.parse(text);
	return nodesInSelection(tree, text, from, to);
}
