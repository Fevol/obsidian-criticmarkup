import { EditorState, StateField } from '@codemirror/state';
import { type ChangedRange, type SyntaxNode, type Tree, TreeFragment } from '@lezer/common';

import {
	CriticMarkupNode, CriticMarkupNodes,
	AdditionNode, CommentNode, DeletionNode, HighlightNode, SubstitutionNode, NodeType,
} from '../nodes';

import { criticmarkupLanguage } from '../parser';

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


function constructFromSyntaxNode(node: SyntaxNode, text: string) {
	const metadata = node.firstChild?.type.name.startsWith('MDSep') ? node.firstChild!.from : undefined;
	let middle = undefined;
	if (node.type.name === 'Substitution') {
		const child = (metadata ? node.childAfter(2) : node.firstChild);
		if (!child || child.type.name !== "MSub") return;
		middle = child.from;
	}

	return constructNode(node.from, node.to, node.type.name, text.slice(node.from, node.to), middle, metadata);
}

export function nodesInSelection(tree: Tree, text: string) {
	const nodes: CriticMarkupNode[] = [];

	// Skip CriticMarkup root node
	const cursor = tree.cursor();
	if (cursor.next(true)) {
		do {
			const node = cursor.node;

			if (node.type.name === "⚠") continue;
			const new_node = constructFromSyntaxNode(node, text);
			if (new_node) nodes.push(new_node);
		} while (cursor.nextSibling())

	}

	return new CriticMarkupNodes(nodes);
}

export function selectionContainsNodes(state: EditorState) {
	const nodes = state.field(nodeParser).nodes;
	return nodes.nodes.length ? state.selection.ranges.some(range =>
		nodes.range_contains_node(range.from, range.to),
	) : false;
}

export function getNodesInText(text: string) {
	const tree = criticmarkupLanguage.parser.parse(text);
	return nodesInSelection(tree, text);
}

export function constructNode(from: number, to: number, type: string, text: string, middle?: number, metadata?: number) {
	switch (type) {
		case 'Addition':
			return new AdditionNode(from, to, text, metadata);
		case 'Deletion':
			return new DeletionNode(from, to, text, metadata);
		case 'Substitution':
			return new SubstitutionNode(from, middle!, to, text, metadata);
		case 'Highlight':
			return new HighlightNode(from, to, text, metadata);
		case 'Comment':
			return new CommentNode(from, to, text, metadata);
		default:
			// Will never get called
			return new AdditionNode(from, to, text, metadata);
	}
}

export const NODE_PROTOTYPE_MAPPER = {
	[NodeType.ADDITION]: AdditionNode,
	[NodeType.DELETION]: DeletionNode,
	[NodeType.HIGHLIGHT]: HighlightNode,
	[NodeType.SUBSTITUTION]: SubstitutionNode,
	[NodeType.COMMENT]: CommentNode,
};
