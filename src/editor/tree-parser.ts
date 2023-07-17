import { StateField } from '@codemirror/state';
import type { ChangedRange, Tree } from '@lezer/common';
import { TreeFragment } from '@lezer/common';
import { criticmarkupLanguage } from './parser';

export const treeParser: StateField<{tree: Tree, fragments: TreeFragment}> = StateField.define({
	create(state) {
		const tree = criticmarkupLanguage.parser.parse(state.doc.toString());
		const fragments = TreeFragment.addTree(tree);

		return {
			tree: tree,
			fragments: fragments,
		}
	},

	// @ts-ignore (Not sure how to set fragments as readonly)
	update(value, tr) {
		if (!tr.docChanged) return value;

		const changed_ranges: ChangedRange[] = [];
		tr.changes.iterChangedRanges((from, to, fromB, toB) =>
			changed_ranges.push({fromA: from, toA: to, fromB: fromB, toB: toB})
		);

		let fragments = TreeFragment.applyChanges(value.fragments, changed_ranges);

		const tree = criticmarkupLanguage.parser.parse(tr.state.doc.toString(), fragments);
		fragments = TreeFragment.addTree(tree, fragments);

		return {
			tree: tree,
			fragments: fragments,
		}
	},
});
