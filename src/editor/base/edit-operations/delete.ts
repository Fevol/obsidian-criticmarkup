import { EditorSelection, EditorState, SelectionRange, Text } from '@codemirror/state';

import { type EditorEditChange, type EditorChange, type OperationReturn } from './types';
import { cursor_move } from './cursor';

import { CriticMarkupRanges, SubstitutionRange, SuggestionType, CM_All_Brackets } from '../ranges';
import { findBlockingChar } from '../edit-util';


export function text_delete(range: EditorEditChange, ranges: CriticMarkupRanges, offset: number, doc: Text,
							backwards_delete: boolean, group_delete: boolean, selection_delete: boolean, state: EditorState,
							keep_selection: boolean = false): OperationReturn {
	// FIXME: Efficiency: Reduce if statement complexity (redundant if checks, deep nesting) <-> readability
	// TODO: Readability: Better commenting
	// FIXME: Efficiency: ranges.XXX operations might be pretty expensive, B+tree or smarter usage

	const changes: EditorChange[] = [];
	const original_offset = offset;

	let cursor_offset = 0;
	let deletion_start = range.from;
	let deletion_end = range.to;
	let deletion_cursor: number;

	// Iff cursor delete: find cursor position of delete as if CM syntax does not exist
	if (!selection_delete) {
		const deletion_anchor = !backwards_delete ? deletion_start : deletion_end;
		// TODO: Replace instances of state with searching through range text (cheaper)
		const deletion_head = group_delete ? findBlockingChar(deletion_anchor, !backwards_delete, state)[0]
			: deletion_anchor + (backwards_delete ? -1 : 1);

		const orig_sel = { from: 0, to: 0, head: deletion_anchor, anchor: deletion_anchor };
		const new_sel = { from: 0, to: 0, head: deletion_head, anchor: deletion_head };

		const cursor = cursor_move(new_sel, orig_sel,
			ranges, state, backwards_delete, group_delete, selection_delete, false);

		if (backwards_delete) deletion_start = cursor.selection.head;
		else deletion_end = cursor.selection.head;
	}

	const encountered_ranges = ranges.filter_range(deletion_start, deletion_end, true);
	const inside_range = encountered_ranges.ranges.length === 1 && encountered_ranges.ranges[0].encloses_range(deletion_start, deletion_end);

	let anchor_deletion_start = null;
	let extra_deletion_start = null;

	// For efficiency, no need to re-construct ranges if deletion is cursor movement operation (inside DEL or left part of SUB)
	if (inside_range && (encountered_ranges.ranges[0].type === SuggestionType.DELETION ||
		(encountered_ranges.ranges[0].type === SuggestionType.SUBSTITUTION && encountered_ranges.ranges[0].part_encloses_range(deletion_start, deletion_end, true))
	)) {
		deletion_cursor = backwards_delete ? deletion_start : deletion_end;
	} else {
		let left_range = encountered_ranges.at_cursor(deletion_start),
			right_range = encountered_ranges.at_cursor(deletion_end, false, true);

		const original_deletion_start = deletion_start;

		// Move deletion range to account for critic markup deletions
		if (left_range) {
			if (deletion_start !== left_range.to)
				deletion_start = left_range.cursor_move_outside(deletion_start, left_range.type !== SuggestionType.DELETION);

			if (deletion_start === left_range.from) {
				const left_adjacent_range = ranges.adjacent_to_range(left_range, true, true);
				if (left_adjacent_range && (left_adjacent_range.type === SuggestionType.DELETION))
					left_range = left_adjacent_range;
				else left_range = undefined;
			}

			// TODO: Deletion in addition -> Turn entire thing into Substitution?
			if (left_range) {
				if (left_range.type === SuggestionType.DELETION && right_range?.type === SuggestionType.SUBSTITUTION
					&& deletion_start <= (right_range as SubstitutionRange).middle + 2) {
					anchor_deletion_start = left_range.to;
					extra_deletion_start = range.from;
					deletion_start = left_range.from;
					left_range = undefined;
				} else if (left_range.type === SuggestionType.SUBSTITUTION && deletion_start <= (left_range as SubstitutionRange).middle) {
					anchor_deletion_start = deletion_start + 3;
					deletion_start = left_range.from;
					left_range = undefined;
				} else if (deletion_start === left_range.to) {
					if (left_range.type === SuggestionType.DELETION)
						deletion_start = left_range.to - 3;
					else left_range = undefined;
				}
			}
		}

		if (right_range) {
			if (deletion_end !== right_range.from)
				deletion_end = right_range.cursor_move_outside(deletion_end, right_range.type === SuggestionType.DELETION);

			if (deletion_end === right_range.to) {
				const right_adjacent_range = ranges.adjacent_to_range(right_range, false, true);
				if (right_adjacent_range && (right_adjacent_range.type === SuggestionType.DELETION || right_adjacent_range.type === SuggestionType.SUBSTITUTION))
					right_range = right_adjacent_range;
				else right_range = undefined;
			}

			if (right_range) {
				// TODO: Investigate - Why did I write this code? What does it do?
				if (deletion_end === right_range.from) {
					if (right_range.type === SuggestionType.DELETION)
						deletion_end = right_range.from + 3;
					else if (right_range.type === SuggestionType.SUBSTITUTION) {
						if (left_range?.type === SuggestionType.DELETION) {
							anchor_deletion_start = deletion_start;
							deletion_start = left_range.from;
							console.error("BIG OL WARNING")
							left_range = undefined;
						}
						deletion_end = right_range.from + 3;
					} else right_range = undefined;
				}
			}
		}

		// TODO: Optimize(?): Slowest part of the algorithm
		let encountered_text = ranges.unwrap_in_range(doc, deletion_start, deletion_end);

		let final_string = '';

		// Add in all brackets where necessary to form valid CM ranges
		// NOTE: Any place where left_range.type is ADDITION, it can also be HIGHLIGHT or COMMENT
		//		 Keep in mind: you might want different deletion behaviour (i.e. 'ignore' for comments)
		if (left_range) {
			if (left_range.type === SuggestionType.ADDITION || left_range.type === SuggestionType.HIGHLIGHT || left_range.type === SuggestionType.COMMENT)
				final_string += CM_All_Brackets[left_range.type][1];
			if (left_range.type === SuggestionType.SUBSTITUTION) {
				if (deletion_start <= (left_range as SubstitutionRange).middle)
					final_string += CM_All_Brackets[SuggestionType.SUBSTITUTION][1];
				final_string += CM_All_Brackets[SuggestionType.SUBSTITUTION][2];
			}
		}

		if (left_range?.type !== SuggestionType.DELETION && right_range?.type !== SuggestionType.SUBSTITUTION)
			final_string += CM_All_Brackets[SuggestionType.DELETION][0];
		if (right_range?.type === SuggestionType.SUBSTITUTION)
			final_string += CM_All_Brackets[SuggestionType.SUBSTITUTION][0];
		const left_added = final_string.length;

		final_string += encountered_text.output;

		if (!right_range || right_range.type === SuggestionType.ADDITION || right_range.type === SuggestionType.HIGHLIGHT || right_range.type === SuggestionType.COMMENT)
			final_string += CM_All_Brackets[SuggestionType.DELETION][1];

		if (right_range) {
			if (right_range.type === SuggestionType.ADDITION || right_range.type === SuggestionType.HIGHLIGHT || right_range.type === SuggestionType.COMMENT)
				final_string += CM_All_Brackets[right_range.type][0];
			if (right_range.type === SuggestionType.SUBSTITUTION && deletion_end >= (<SubstitutionRange>right_range).middle + 2)
				final_string += CM_All_Brackets[SuggestionType.SUBSTITUTION][1];
		}


		// Recompute cursor location based on added/removed brackets
		const right_added = final_string.length - encountered_text.output.length - left_added;
		const added_chars = left_added + right_added;
		const removed_chars = (deletion_end - deletion_start) - encountered_text.output.length;
		if (anchor_deletion_start !== null)
			cursor_offset -= 6;

		offset -= removed_chars - added_chars;
		cursor_offset += removed_chars - added_chars + left_added;

		changes.push({ from: deletion_start, to: deletion_end, insert: final_string });

		// Compute actual text characters that were moved into the range
		if (anchor_deletion_start)
			encountered_text = ranges.unwrap_in_range(doc, original_deletion_start, deletion_end);
		deletion_cursor = (anchor_deletion_start ?? deletion_start) + (backwards_delete ? 0 : encountered_text.output.length);
	}

	let selection: SelectionRange;
	if (!keep_selection)
		selection = EditorSelection.cursor(deletion_cursor + cursor_offset + offset);
	else {
		selection = EditorSelection.range(
			(extra_deletion_start ?? deletion_start) + original_offset,
			deletion_end + offset
		);
	}

	return { changes, selection, offset };
}
