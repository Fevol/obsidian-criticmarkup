import { StateField } from '@codemirror/state';
import type { ChangedRange, Tree } from '@lezer/common';
import { TreeFragment } from '@lezer/common';
import { criticmarkupLanguage } from './parser';
import { nodesInSelection } from './editor-util';
import { type CriticMarkupNodes } from './criticmarkup-nodes';

export const treeParser: StateField<{tree: Tree, fragments: readonly TreeFragment[], nodes: CriticMarkupNodes}> = StateField.define({
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
