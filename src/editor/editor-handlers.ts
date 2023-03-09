import { ChangeSpec, EditorSelection, EditorState, Prec } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { criticmarkupLanguage } from './parser';
import { moveEditorCursor, nodeAtCursor } from './editor-util';
import { CM_Brackets } from '../util';

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
		});
		return true;
	}
	return false;
}))

export const nodeCorrecter = EditorState.transactionFilter.of(tr => {
	// From 'tr', get the spec from a decoration transaction
	if (tr.isUserEvent('select')) {
		const previous_selection = <EditorSelection>tr.startState.selection,
			  current_selection = <EditorSelection>tr.selection;

		if (current_selection.main.anchor === current_selection.main.head) {
			const text = tr.startState.doc.toString();
			const tree = criticmarkupLanguage.parser.parse(text);

			// @ts-ignore (Tree is correct)
			const start_node = nodeAtCursor(tree, previous_selection.main.head);
			// @ts-ignore (Tree is correct)
			const end_node = nodeAtCursor(tree, current_selection.main.head);

			if (start_node && start_node !== end_node &&
				(start_node?.type.name === 'Substitution' || start_node?.type.name === 'Highlight')) {
				let new_text = text.slice(start_node.from, start_node.to);
				let changed = false;

				let removed_characters = 0;
				let left_whitespace_end = new_text.slice(3).search(/\S/);
				if (left_whitespace_end >= 1) {
					changed = true;
					new_text = new_text.slice(0, 3) + new_text.slice(3 + left_whitespace_end);
					removed_characters += left_whitespace_end;
				} else
					left_whitespace_end = 0;

				const invalid_endlines = new_text.match(/\n\s*\n/g);
				if (invalid_endlines) {
					changed = true;
					new_text = new_text.replace(/\n\s*\n/g, '\n');
					removed_characters += invalid_endlines.reduce((acc, cur) => acc + cur.length, 0);
				}

				if (changed) {
					const changes: ChangeSpec[] = [{
						from: start_node.from,
						to: start_node.to,
						insert: new_text,
					}];
					return {
						changes,
						selection: moveEditorCursor(current_selection, start_node.from + 3 + left_whitespace_end, -removed_characters),
					}
				}
			}
		}
	}

	return tr;
});