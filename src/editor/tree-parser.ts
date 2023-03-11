import { StateField } from '@codemirror/state';
import type { ChangedRange } from '@lezer/common';
import { TreeFragment } from '@lezer/common';
import { criticmarkupLanguage } from './parser';

export const treeParser = StateField.define({
	create(state) {
		const tree = criticmarkupLanguage.parser.parse(state.doc.toString());
		// @ts-ignore
		const fragments = TreeFragment.addTree(tree);

		return {
			tree: tree,
			fragments: fragments,
		}
	},

	// @ts-ignore (Fragments are readonly)
	update(value, tr) {
		if (!tr.docChanged) return value;

		const changed_ranges: ChangedRange[] = [];
		tr.changes.iterChangedRanges((from, to, fromB, toB) =>
			changed_ranges.push({fromA: from, toA: to, fromB: fromB, toB: toB})
		);

		let fragments = TreeFragment.applyChanges(value.fragments, changed_ranges);

		// @ts-ignore
		const tree = criticmarkupLanguage.parser.parse(tr.state.doc.toString(), fragments);
		// @ts-ignore
		fragments = TreeFragment.addTree(tree, fragments);

		return {
			tree: tree,
			fragments: fragments,
		}
	},
});