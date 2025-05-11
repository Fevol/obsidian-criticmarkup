import { CharCategory, EditorSelection, type EditorState } from "@codemirror/state";
import {
	type BracketOptionsMap,
	type CursorOptionsMap,
	RANGE_BRACKET_MOVEMENT_OPTION,
	RANGE_CURSOR_MOVEMENT_OPTION,
} from "../../../types";
import { findBlockingChar, getCharCategory } from "../edit-util";
import { CriticMarkupRange, CriticMarkupRanges, SuggestionType } from "../ranges";
import type { EditorRange } from "./types";

function cat_ignore_ws(cat: CharCategory | null) {
	return cat === CharCategory.Space || cat === null;
}

function cat_different(old_cat: CharCategory | null, new_cat: CharCategory | null) {
	return old_cat !== null && old_cat !== CharCategory.Space && old_cat !== new_cat;
}

/**
 * Attempt to efficiently find the new suggestion range after a cursor movement
 * @param cursor_head - Current cursor head
 * @param ranges - All suggestion ranges in the document
 * @param range - Current suggestion range
 * @remark This function exists to prevent having to iterate through all suggestion ranges when trying to find the new range after a cursor movement
 */
function find_range_cursor(cursor_head: number, ranges: CriticMarkupRanges, range: CriticMarkupRange) {
	if (range.cursor_inside(cursor_head))
		return range;
	else {
		const check_direction = range.cursor_before_range(cursor_head);
		let range_idx = ranges.ranges.indexOf(range) + (check_direction ? -1 : 1);

		while (range_idx >= 0 && range_idx < ranges.ranges.length) {
			range = ranges.ranges[range_idx];
			if (check_direction ? range.cursor_before_range(cursor_head) : range.cursor_after_range(cursor_head))
				range_idx += check_direction ? -1 : 1;
			else
				return range.cursor_inside(cursor_head) ? range : undefined;
		}
	}

	return undefined;
}

/**
 * Advance the cursor through CriticMarkup syntax, based on the movement options for the range type
 * @param cursor_head - Current cursor head
 * @param move_forwards - Whether the cursor movement is forwards or backwards
 * @param ranges - All suggestion ranges in the document
 * @param range - Current suggestion range
 * @param movement_options - Options for cursor movement through suggestion ranges
 * @param bracket_options - Options for cursor movement between different suggestion ranges
 */
function cursor_advance_through_syntax(
	cursor_head: number,
	move_forwards: boolean,
	ranges: CriticMarkupRanges,
	range: CriticMarkupRange | undefined,
	movement_options: CursorOptionsMap,
	bracket_options: BracketOptionsMap | null,
): [number, CriticMarkupRange | undefined] {
	if (!range)
		range = ranges.range_adjacent_to_cursor(cursor_head, !move_forwards, true, true);
	else
		range = find_range_cursor(cursor_head, ranges, range);

	let cursor_changed = true;
	while (cursor_changed && range) {
		const old_cursor_head = cursor_head;
		cursor_head = range!.cursor_move_through(cursor_head, move_forwards, movement_options[range!.type]);
		cursor_changed = cursor_head !== old_cursor_head;
		if (cursor_changed && cursor_head === (move_forwards ? range.to : range.from)) {
			range = ranges.adjacent_range(range!, !move_forwards, true);
			if (range && bracket_options && bracket_options[range.type] === RANGE_BRACKET_MOVEMENT_OPTION.STAY_OUTSIDE)
				break;
		}
	}

	return [cursor_head, range];
}

/**
 * @param old_head - Original cursor head
 * @param new_head - Cursor head after *regular* cursor movement
 * @param ranges - All suggestion ranges in the document
 * @param move_forwards - Whether the cursor movement is forwards or backwards
 * @param by_word_group - Whether to move by word group (ctrl/alt + arrow keys)
 * @param is_selection - Whether to extend the selection of the original range
 * @param is_block_cursor - Whether cursor is considered as a block cursor (vim mode)
 * @param state - Editor state
 * @param movement_options - Options for cursor movement through suggestion ranges
 * @param bracket_options - Options for cursor movement through brackets
 */
export function advance_cursor_head(
	old_head: number,
	new_head: number,
	ranges: CriticMarkupRanges,
	move_forwards: boolean,
	by_word_group: boolean,
	is_block_cursor = false,
	state: EditorState,
	movement_options: CursorOptionsMap,
	bracket_options: BracketOptionsMap,
): number {
	// NOTE: The reason why both old and new cursor head are used, is because it is not simple to both:
	//  - Recreate the entire movement action palette within this function and apply on original range (e.g. move to beginning of note, ...)
	//          -> Use new cursor head to have a starting point
	//  - Verify that none of the ranges the cursor passes through with the original movement are blocking using only the new cursor range
	//          -> Move from old head to verify that none of the ranges are blocking

	let suggestion_range = ranges.range_adjacent_to_cursor(old_head, !move_forwards, true, !by_word_group);

	// If no range exists in movement direction OR cursor has not passed a range OR movement through range is set to be the same,
	// then just return the new range as-is without additional processing
	if (
		!suggestion_range ||
		(move_forwards ?
			suggestion_range.cursor_before_range(new_head) :
			suggestion_range.cursor_after_range(new_head)) ||
		movement_options[suggestion_range.type] === RANGE_CURSOR_MOVEMENT_OPTION.UNCHANGED
	) {
		return new_head;
	}

	// Check if difference in movement is only one character (single character movement)
	if (!by_word_group && Math.abs(old_head - new_head) === 1) {
		[new_head, suggestion_range] = cursor_advance_through_syntax(
			old_head,
			move_forwards,
			ranges,
			suggestion_range,
			movement_options,
			bracket_options,
		);
		new_head = new_head + (move_forwards ? 1 : -1);
	} else if (!by_word_group) {
		[new_head, suggestion_range] = cursor_advance_through_syntax(
			new_head,
			move_forwards,
			ranges,
			suggestion_range,
			movement_options,
			bracket_options,
		);
	} else {
		let previous_reg_char = cursor_advance_through_syntax(
			new_head,
			!move_forwards,
			ranges,
			suggestion_range,
			movement_options,
			null,
		)[0];
		let previous_cat = null,
			current_cat = (previous_reg_char === old_head) ?
				null :
				getCharCategory(previous_reg_char, state, move_forwards);
		let next_cursor_head = new_head;

		while (!cat_different(previous_cat, current_cat)) {
			new_head = next_cursor_head;
			previous_cat = current_cat;
			[new_head, suggestion_range] = cursor_advance_through_syntax(
				new_head,
				move_forwards,
				ranges,
				suggestion_range,
				movement_options,
				bracket_options,
			);
			next_cursor_head =
				findBlockingChar(new_head, move_forwards, state, cat_ignore_ws(previous_cat), previous_cat)[0];
			if (next_cursor_head === new_head)
				break;
			previous_reg_char = cursor_advance_through_syntax(
				next_cursor_head,
				!move_forwards,
				ranges,
				suggestion_range,
				movement_options,
				null,
			)[0];
			current_cat = getCharCategory(previous_reg_char, state, move_forwards);
		}
	}

	// Post-processing step: move cursor back to inside range if necessary
	if (suggestion_range && !(new_head === 0 || new_head === state.doc.length)) {
		const range_back = move_forwards ? suggestion_range.to : suggestion_range.from;
		const offset = move_forwards ? 1 : -1;
		if (new_head === range_back) {
			if (bracket_options[suggestion_range.type] === RANGE_BRACKET_MOVEMENT_OPTION.STAY_INSIDE)
				new_head = range_back - 3 * offset;
		} else if (suggestion_range.touches_bracket(new_head, move_forwards, false, true)) {
			new_head = move_forwards ? suggestion_range.from : suggestion_range.to;
		}
	}

	// Sanity check: clamp cursor to document length
	return Math.clamp(new_head, 0, state.doc.length);
}

/**
 * @param old_cursor_range - Original cursor range
 * @param new_cursor_range - Cursor range after *regular* cursor movement
 * @param ranges - All suggestion ranges in the document
 * @param move_forwards - Whether the cursor movement is forwards or backwards
 * @param by_word_group - Whether to move by word group (ctrl/alt + arrow keys)
 * @param is_selection - Whether to extend the selection of the original range
 * @param is_block_cursor - Whether cursor is considered as a block cursor (vim mode)
 * @param state - Editor state
 * @param movement_options - Options for cursor movement through suggestion ranges
 * @param bracket_options - Options for cursor movement through brackets
 */
export function cursor_move(
	old_cursor_range: EditorRange,
	new_cursor_range: EditorRange,
	ranges: CriticMarkupRanges,
	move_forwards: boolean,
	by_word_group: boolean,
	is_selection: boolean,
	is_block_cursor = false,
	state: EditorState,
	movement_options: CursorOptionsMap,
	bracket_options: BracketOptionsMap,
) {
	const cursor_head = advance_cursor_head(
		old_cursor_range.head!,
		new_cursor_range.head!,
		ranges,
		move_forwards,
		by_word_group,
		is_block_cursor,
		state,
		movement_options,
		bracket_options,
	);
	let cursor_anchor = old_cursor_range.anchor!;

	if (!is_selection)
		cursor_anchor = cursor_head;

	return { selection: EditorSelection.range(cursor_anchor, cursor_head) };
}

const default_movement_options: CursorOptionsMap = {
	[SuggestionType.ADDITION]: RANGE_CURSOR_MOVEMENT_OPTION.IGNORE_METADATA,
	[SuggestionType.DELETION]: RANGE_CURSOR_MOVEMENT_OPTION.IGNORE_METADATA,
	[SuggestionType.SUBSTITUTION]: RANGE_CURSOR_MOVEMENT_OPTION.IGNORE_METADATA,
	[SuggestionType.COMMENT]: RANGE_CURSOR_MOVEMENT_OPTION.IGNORE_METADATA,
	[SuggestionType.HIGHLIGHT]: RANGE_CURSOR_MOVEMENT_OPTION.IGNORE_METADATA,
};

const bracket_movement_options: BracketOptionsMap = {
	[SuggestionType.ADDITION]: RANGE_BRACKET_MOVEMENT_OPTION.STAY_INSIDE,
	[SuggestionType.DELETION]: RANGE_BRACKET_MOVEMENT_OPTION.STAY_INSIDE,
	[SuggestionType.SUBSTITUTION]: RANGE_BRACKET_MOVEMENT_OPTION.STAY_INSIDE,
	[SuggestionType.COMMENT]: RANGE_BRACKET_MOVEMENT_OPTION.STAY_INSIDE,
	[SuggestionType.HIGHLIGHT]: RANGE_BRACKET_MOVEMENT_OPTION.STAY_INSIDE,
};

export function cursor_move_range<T extends EditorRange>(
	cursor_range: T,
	ranges: CriticMarkupRanges,
	backwards_delete: boolean,
	group_delete: boolean,
	state: EditorState,
	movement_options: CursorOptionsMap = default_movement_options,
	bracket_options: BracketOptionsMap = bracket_movement_options,
): T {
	if (!cursor_range.selection) {
		const cursor_anchor = cursor_range.anchor!;
		let cursor_head = backwards_delete ? cursor_range.from : cursor_range.to;
		cursor_head = advance_cursor_head(
			cursor_anchor,
			cursor_head,
			ranges,
			!backwards_delete,
			group_delete,
			false,
			state,
			movement_options,
			bracket_options,
		);
		if (backwards_delete)
			cursor_range.from = cursor_head;
		else
			cursor_range.to = cursor_head;
	}
	return cursor_range;
}
