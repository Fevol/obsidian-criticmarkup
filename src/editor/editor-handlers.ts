import { EditorView } from '@codemirror/view';
import { type ChangeSpec, EditorSelection, EditorState, Prec } from '@codemirror/state';

import { treeParser } from './tree-parser';

import { CM_Brackets } from '../util';
import { nodesInSelection } from './editor-util';
import { NodeType } from '../types';

export const bracketMatcher = Prec.high(EditorView.inputHandler.of((view, from, to, text) => {
	const before = view.state.doc.sliceString(from - 2, from) + text;

	let bracket;
	if ((bracket = CM_Brackets[before]) !== undefined) {
		const changes: ChangeSpec[] = [{
			from,
			to: to + 1,
			insert: text + bracket.join(''),
		}];

		view.dispatch({
			changes,
			selection: EditorSelection.cursor(to + 1),
			userEvent: 'ignore'
		});
		return true;
	}
	return false;
}));

/**
 * Removes initial whitespaces and double newlines from nodes that would otherwise result in markup being applied
 * to text that is not part of the node (due to CM shenanigans)
 */
export const nodeCorrecter = EditorState.transactionFilter.of(tr => {
	if (tr.isUserEvent('select')) {
		const previous_selection = tr.startState.selection.main, current_selection = tr.selection!.main;

		if (current_selection.anchor === current_selection.head) {
			const text = tr.startState.doc.toString();
			const tree = tr.startState.field(treeParser).tree;
			const nodes = nodesInSelection(tree)

			const start_node = nodes.at_cursor(previous_selection.head);
			const end_node = nodes.at_cursor(current_selection.head);

			// Execute only if the cursor is moved outside a particular node
			if (start_node && start_node !== end_node &&
				(start_node.type === NodeType.SUBSTITUTION || start_node.type === NodeType.HIGHLIGHT)) {
				let new_text = start_node.unwrap(text);
				let changed = false;

				let removed_characters = 0;
				const left_whitespace_end = new_text.search(/\S/);
				if (left_whitespace_end >= 1) {
					changed = true;
					new_text = new_text.slice(left_whitespace_end);
					removed_characters += left_whitespace_end;
				}

				const invalid_endlines = new_text.match(/\n\s*\n/g);
				if (invalid_endlines) {
					changed = true;
					new_text = new_text.replace(/\n\s*\n/g, '\n');
					removed_characters += invalid_endlines.reduce((acc, cur) => acc + cur.length, 0);
				}

				if (changed) {
					const changes: ChangeSpec[] = [{
						from: start_node.from + 3,
						to: start_node.to - 3,
						insert: new_text,
					}];
					return {
						changes,
						selection: EditorSelection.cursor(current_selection.head - removed_characters),
					};
				}
			}
		}
	}

	return tr;
});
