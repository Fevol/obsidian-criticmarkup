import { type ChangeSpec, EditorSelection, Prec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { CM_Brackets } from "../../base";

export const bracketMatcher = Prec.high(EditorView.inputHandler.of((view, from, to, text) => {
	const before = view.state.doc.sliceString(from - 2, from) + text;

	let bracket;
	if ((bracket = CM_Brackets[before]) !== undefined) {
		const changes: ChangeSpec[] = [{
			from,
			to: to + 1,
			insert: text + bracket.join(""),
		}];

		view.dispatch({
			changes,
			selection: EditorSelection.cursor(to + 1),
		});
		return true;
	}
	return false;
}));
