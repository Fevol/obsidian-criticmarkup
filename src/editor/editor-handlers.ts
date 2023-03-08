import { ChangeSpec, EditorSelection, EditorState, Prec } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { CM_Brackets } from '../constants';
import { criticmarkupLanguage } from './parser';
import { moveEditorCursor, nodeAtCursor } from './util';

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

			if (start_node && start_node !== end_node && start_node?.type.name === 'Substitution') {
				if (text[start_node.from + 3].match(/\s/)) {
					const left_whitespace_end = text.slice(start_node.from + 3).search(/\S/);
					const changes: ChangeSpec[] = [{
						from: start_node.from,
						to: start_node.to,
						insert:  text.slice(start_node.from, start_node.from + 3) +
							text.slice(start_node.from + 3 + left_whitespace_end, start_node.to),
					}];
					return {
						changes,
						selection: moveEditorCursor(current_selection, start_node.from + 3 + left_whitespace_end, -left_whitespace_end),
					}
				}
			}
		}
	}

	return tr;
});