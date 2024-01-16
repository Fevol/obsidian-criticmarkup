import type {EditorRange} from "../edit-operations";
import {
    CriticMarkupRange,
    CriticMarkupRanges,
} from "../ranges";
import {CharCategory, EditorSelection, type EditorState} from "@codemirror/state";
import {findBlockingChar, getCharCategory} from "../edit-util";
import {
    RANGE_BRACKET_MOVEMENT_OPTION,
    RANGE_CURSOR_MOVEMENT_OPTION,
    RangeBracketMovementOptionsMap,
    RangeCursorMovementOptionsMap
} from "../../../types";

function cat_ignore_ws(cat: CharCategory | null) {
    return cat === CharCategory.Space || cat === null;
}

function cat_different(old_cat: CharCategory | null, new_cat: CharCategory | null) {
    return old_cat !== null && old_cat !== CharCategory.Space && old_cat !== new_cat;
}


function cursor_advance_through_syntax(cursor_head: number, move_forwards: boolean, ranges: CriticMarkupRanges, movement_options: RangeCursorMovementOptionsMap): [number, CriticMarkupRange | undefined] {
    let range = ranges.range_adjacent_to_cursor(cursor_head, !move_forwards, true, true);
    let cursor_changed = true;
    while (cursor_changed && range) {
        const old_cursor_head = cursor_head;
        cursor_head = range!.cursor_pass_syntax(cursor_head, move_forwards, movement_options[range!.type]);
        cursor_changed = cursor_head !== old_cursor_head;
        if (cursor_changed && cursor_head === (move_forwards ? range.to : range.from))
            range = ranges.adjacent_range(range!, !move_forwards, true);
    }

    return [cursor_head, range];
}


/**
 *
 * @param original_range - Original cursor range
 * @param new_range - Cursor range after *regular* cursor movement
 * @param ranges - All suggestion ranges in the document
 * @param move_forwards - Whether the cursor movement is forwards or backwards
 * @param by_word_group - Whether to move by word group (ctrl/alt + arrow keys)
 * @param is_selection - Whether to extend the selection of the original range
 * @param is_block_cursor - Whether cursor is considered as a block cursor (vim mode)
 * @param state - Editor state
 * @param movement_options - Options for cursor movement through suggestion ranges
 * @param bracket_options - Options for cursor movement through brackets
 */
export function cursor_move(original_range: EditorRange, new_range: EditorRange, ranges: CriticMarkupRanges,
    move_forwards: boolean, by_word_group: boolean, is_selection: boolean, is_block_cursor = false,
    state: EditorState, movement_options: RangeCursorMovementOptionsMap, bracket_options: RangeBracketMovementOptionsMap,
) {

    let cursor_head = new_range.head!;
    let cursor_anchor = new_range.anchor!;

    let suggestion_range = ranges.range_adjacent_to_cursor(original_range.head!, !move_forwards, true, !by_word_group);
    // If no range exists in movement direction OR cursor has not passed a range OR movement through range is set to be the same,
    // then just return the new range as-is without additional processing
    if (!suggestion_range ||
        (move_forwards ? suggestion_range.cursor_before_range(cursor_head) : suggestion_range.cursor_after_range(cursor_head)) ||
        movement_options[suggestion_range.type] === RANGE_CURSOR_MOVEMENT_OPTION.UNCHANGED) {
        return {selection: EditorSelection.range(cursor_anchor, cursor_head)};
    }

    // Check if difference in movement is only one character (single character movement)
    if (!by_word_group && Math.abs(original_range.head! - new_range.head!) === 1) {
        cursor_head = cursor_advance_through_syntax(original_range.head!, move_forwards, ranges, movement_options)[0];
        cursor_head = cursor_head + (move_forwards ? 1 : -1);
    } else if (!by_word_group) {
        cursor_head = cursor_advance_through_syntax(cursor_head, move_forwards, ranges, movement_options)[0];
    } else {
        let previous_reg_char = cursor_advance_through_syntax(cursor_head, !move_forwards, ranges, movement_options)[0];
        let previous_cat = null,
            current_cat = (previous_reg_char === original_range.head!) ? null : getCharCategory(previous_reg_char, state, move_forwards);
        let next_cursor_head = cursor_head;

        while (!cat_different(previous_cat, current_cat)) {
            cursor_head = next_cursor_head;
            previous_cat = current_cat;
            cursor_head = cursor_advance_through_syntax(cursor_head, move_forwards, ranges, movement_options)[0];
            next_cursor_head = findBlockingChar(cursor_head, move_forwards, state, cat_ignore_ws(previous_cat), previous_cat)[0];
            if (next_cursor_head === cursor_head)
                break;
            previous_reg_char = cursor_advance_through_syntax(next_cursor_head, !move_forwards, ranges, movement_options)[0];
            current_cat = getCharCategory(previous_reg_char, state, move_forwards);
        }
    }

    suggestion_range = ranges.range_adjacent_to_cursor(cursor_head, !move_forwards, true, false);
    if (suggestion_range) {
        const range_back = move_forwards ? suggestion_range.to : suggestion_range.from;
        // const range_front = move_forwards ? suggestion_range.from : suggestion_range.to;
        const offset = move_forwards ? 1 : -1;
        if (cursor_head === range_back) {
            if (bracket_options[suggestion_range.type] === RANGE_BRACKET_MOVEMENT_OPTION.STAY_INSIDE)
                cursor_head = range_back - 3 * offset;
        } else if (suggestion_range.touches_bracket(cursor_head, move_forwards, false, true)) {
            cursor_head = move_forwards ? suggestion_range.from : suggestion_range.to;
        }

    }

    // If the cursor is not a selection, then the cursor anchor should be moved to the cursor head
    if (!is_selection)
        cursor_anchor = cursor_head;

    return {selection: EditorSelection.range(cursor_anchor, cursor_head)};
}
