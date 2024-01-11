import { EditorSelection, Text } from '@codemirror/state';

import { type EditorEditChange, type EditorChange, type OperationReturn } from './types';

import { CriticMarkupRanges, SubstitutionRange, SuggestionType, CM_All_Brackets } from '../ranges';

export function text_replace(range: EditorEditChange, ranges: CriticMarkupRanges, offset: number, doc: Text): OperationReturn {
	const changes: EditorChange[] = [];
	let cursor_offset = 0;
	let deletion_start = range.from;
	let deletion_end = range.to;
	let anchor_deletion_end = null;

	const encountered_ranges = ranges.filter_range(deletion_start, deletion_end, true);
	let left_range = encountered_ranges.at_cursor(deletion_start),
		right_range = encountered_ranges.at_cursor(deletion_end, false, true);

	if (left_range) {
		if (deletion_start !== left_range.to)
			deletion_start = left_range.cursor_move_outside(deletion_start, left_range.type !== SuggestionType.DELETION);

		if (deletion_start === left_range.from) {
			const left_adjacent_range = ranges.adjacent_to_range(left_range, true, true);
			if (left_adjacent_range && (left_adjacent_range.type === SuggestionType.DELETION))
				left_range = left_adjacent_range;
			else left_range = undefined;
		}

		if (left_range) {
			if (left_range.type === SuggestionType.DELETION) {
				deletion_start = left_range.from;
				left_range = undefined;
			} else if (left_range.type === SuggestionType.SUBSTITUTION && deletion_start >= (left_range as SubstitutionRange).middle) {
				deletion_start = left_range.from;
				left_range = undefined;
			}
		}
	}

	if (right_range) {
		if (deletion_end !== right_range.from)
			deletion_end = right_range.cursor_move_outside(deletion_end, false/*, right_range.type === SuggestionType.DELETION*/);

		if (deletion_end === right_range.to) {
			const right_adjacent_range = ranges.adjacent_to_range(right_range, false, true);
			if (right_adjacent_range?.type === SuggestionType.ADDITION)
				right_range = right_adjacent_range;
			else right_range = undefined;
		}

		if (right_range) {
			if (right_range.type === SuggestionType.ADDITION) {
				anchor_deletion_end = Math.max(right_range.from + 3, deletion_end);
				deletion_end = right_range.to;
				right_range = undefined;
			} else if (deletion_end === right_range.from) {
				right_range = undefined;
			} else if (right_range.type === SuggestionType.SUBSTITUTION && deletion_end >= (right_range as SubstitutionRange).middle) {
				// Note: can be separated below (might reduce risks of errors), but this is good enough imho
				anchor_deletion_end = deletion_end;
				deletion_end = right_range.to;
				right_range = undefined;
			}
		}
	}

	let deleted_text = ranges.unwrap_in_range(doc, deletion_start, deletion_end).output;
	let inserted_text = range.inserted;

	if (anchor_deletion_end) {
		const offset = deletion_end - anchor_deletion_end - 3;
		inserted_text += deleted_text.slice(deleted_text.length - offset);
		deleted_text = deleted_text.slice(0, deleted_text.length - offset);
	}

	let final_string = "";

	if (!left_range) {
		final_string += CM_All_Brackets[SuggestionType.SUBSTITUTION][0];
	} else {
		if (left_range.type === SuggestionType.SUBSTITUTION) {
			if (deletion_start >= (left_range as SubstitutionRange).middle) {
				final_string += CM_All_Brackets[SuggestionType.SUBSTITUTION][0];
			}
		} else {
			final_string += CM_All_Brackets[left_range.type][1];
			final_string += CM_All_Brackets[SuggestionType.SUBSTITUTION][0];
		}
	}

	final_string += deleted_text;
	final_string += CM_All_Brackets[SuggestionType.SUBSTITUTION][1];

	final_string += inserted_text;

	if (right_range?.type !== SuggestionType.ADDITION)
		final_string += CM_All_Brackets[SuggestionType.SUBSTITUTION][2];
	if (right_range && right_range.type !== SuggestionType.ADDITION) {
		final_string += CM_All_Brackets[right_range.type][0];
		cursor_offset -= 3;
		if (right_range.type === SuggestionType.SUBSTITUTION && deletion_end >= (right_range as SubstitutionRange).middle) {
			final_string += CM_All_Brackets[SuggestionType.SUBSTITUTION][1];
			cursor_offset -= 2;
		}
	}

	changes.push({ from: deletion_start, to: deletion_end, insert: final_string });

	const removed_chars = (deletion_end - deletion_start) - deleted_text.length;
	const added_chars = final_string.length - (deleted_text.length + inserted_text.length);

	offset += added_chars - removed_chars + range.inserted.length;
	cursor_offset -= 3;

	const selection = EditorSelection.cursor(deletion_end + cursor_offset + offset);

	return { changes, selection, offset }
}
