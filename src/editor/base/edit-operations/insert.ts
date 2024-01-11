import { EditorSelection, SelectionRange } from '@codemirror/state';

import { type EditorEditChange, type EditorChange, type OperationReturn } from './types';

import { CriticMarkupRange, CriticMarkupRanges, SubstitutionRange, SuggestionType } from '../ranges';


function insert_new_range(insertion_start: number, offset: number, range_offset: number, cur_range: EditorEditChange, ranges: CriticMarkupRanges, range: CriticMarkupRange, left: boolean) {
	// Check for existence of adjacent range to which text may be added
	const adjacent_range = ranges.adjacent_to_range(range, left, true);
	if (adjacent_range && (adjacent_range.type === SuggestionType.ADDITION || (left && adjacent_range.type === SuggestionType.SUBSTITUTION))) {
		insertion_start = left ? adjacent_range.to - 3 : adjacent_range.from + 3;
	} else {
		insertion_start = left ? range.from : range.to;
		cur_range.inserted = `{++${cur_range.inserted}++}`;
		offset += 6;
		range_offset -= 3;
	}
	return { insertion_start, offset, range_offset };
}


export function text_insert(cur_range: EditorEditChange, ranges: CriticMarkupRanges, offset: number): OperationReturn {
	const range = ranges.at_cursor(cur_range.to);
	offset += cur_range.offset.added;
	const changes: EditorChange[] = [];

	let range_offset = 0;
	let insertion_start = cur_range.from;
	if (!range) {
		cur_range.inserted = `{++${cur_range.inserted}++}`;
		offset += 6;
		range_offset -= 3;
	} else {
		if (range.type === SuggestionType.SUBSTITUTION) {
			if (range.touches_left_bracket(range.to, true, true)) {
				({ insertion_start, offset, range_offset } = insert_new_range(insertion_start, offset, range_offset, cur_range, ranges, range, true));
			} else if (range.touches_separator(range.to, false, true)) {
				insertion_start = (<SubstitutionRange>range).middle;
			} else if (range.touches_right_bracket(range.to)) {
				insertion_start = range.to - 3;
			}
		} else if (range.type === SuggestionType.ADDITION) {
			if (range.touches_left_bracket(range.from)) {
				insertion_start = range.from + 3;
			} else if (range.touches_right_bracket(range.to)) {
				insertion_start = range.to - 3;
			}
		} else {
			if (range.touches_left_bracket(range.from)) {
				({ insertion_start, offset, range_offset } = insert_new_range(insertion_start, offset, range_offset, cur_range, ranges, range, true));
			} else if (range.touches_right_bracket(range.to)) {
				({ insertion_start, offset, range_offset } = insert_new_range(insertion_start, offset, range_offset, cur_range, ranges, range, false));
			}
		}
	}
	changes.push({ from: insertion_start, to: insertion_start, insert: cur_range.inserted });
	const selection: SelectionRange = EditorSelection.cursor(insertion_start + range_offset + offset);

	return { changes, selection, offset };
}
