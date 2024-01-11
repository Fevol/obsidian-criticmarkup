import { type ChangeSpec, EditorSelection, EditorState } from '@codemirror/state';

import { rangeParser, SuggestionType } from '../../base';

/**
 * Removes initial whitespaces and double newlines from ranges that would otherwise result in markup being applied
 * to text that is not part of the range (due to CM shenanigans)
 */
export const rangeCorrecter = EditorState.transactionFilter.of(tr => {
	if (tr.isUserEvent('select')) {
		const previous_selection = tr.startState.selection.main, current_selection = tr.selection!.main;

		if (current_selection.anchor === current_selection.head) {
			const ranges = tr.startState.field(rangeParser).ranges;

			const start_range = ranges.at_cursor(previous_selection.head);
			const end_range = ranges.at_cursor(current_selection.head);

			// Execute only if the cursor is moved outside a particular range
			if (start_range && start_range !== end_range &&
				(start_range.type === SuggestionType.SUBSTITUTION || start_range.type === SuggestionType.HIGHLIGHT)) {
				let new_text = start_range.unwrap();
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
						from: start_range.from + 3,
						to: start_range.to - 3,
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
