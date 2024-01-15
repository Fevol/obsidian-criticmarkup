import {CharCategory, EditorSelection, EditorState} from '@codemirror/state';

import {type EditorRange} from './types';

import {CriticMarkupRange, CriticMarkupRanges, SubstitutionRange} from '../ranges';
import {findBlockingChar, getCharCategory} from '../edit-util';

// To the poor soul who comes across this code, I hope you have more luck wrapping your head around cursor logic than I had
// I sincerely, sincerely hope that I don't ever have to touch this godforsaken, demonic, cursed and all-around evil code ever again.

// FIXME: sometimes, when multiple cursors are used, position of cursor is on the wrong side of a bracket
//		Hypothesis: probably due to middle-mouse multiple selection creation having anchor be selected instead of head?
// FIXME: BWD cursor move in empty substitution does not work (stops before)

function encountered_character(head: number, ranges: CriticMarkupRanges, backwards_select: boolean, state: EditorState, cat_before: null | CharCategory = null): number {
	let cat_during = null;
	const original_head = head;
	[head, cat_during] = findBlockingChar(head, !backwards_select, state, cat_before === CharCategory.Space || cat_before === null, cat_before);

	let range = ranges.range_adjacent_to_cursor(original_head, backwards_select);
	if (!range || !(backwards_select ? head <= range.to : head >= range.from))
		return head;

	const offset = !backwards_select ? 1 : -1;

	// CASE 1: After moving, cursor ends up at the same place; usually the case if text category after cursor changes
	// 		   {++░XXXX▒++}$$$ --> {++XXXX░++}$$$
	if (head === original_head)
		return (!backwards_select ? range.to : range.from) - 3 * offset;

	const range_front = !backwards_select ? range.from : range.to;
	let new_range_front = range_front;
	let new_range_back = !backwards_select ? range.to : range.from;

	while (range?.empty()) {
		new_range_front = !backwards_select ? range.from : range.to;
		new_range_back = !backwards_select ? range.to : range.from;
		range = ranges.adjacent_range(range, backwards_select, true)!;
	}

	cat_during = getCharCategory(new_range_front - offset, state, backwards_select);

	if (!range) {
		const cat_after = getCharCategory(new_range_back, state, backwards_select);
		if ((cat_during !== null && cat_during !== CharCategory.Space) && cat_during !== cat_after)
			return new_range_back;
		return encountered_character(new_range_back, ranges, backwards_select, state, cat_during);
	}

	const resulting_head = encountered_range(new_range_front + 3 * offset, range, ranges, backwards_select, state, cat_during);
	// FIXME: Check if necessary
	if (resulting_head === new_range_front + 3 * offset)
		return range_front;
	return resulting_head;

}

function encountered_range(head: number, range: CriticMarkupRange, ranges: CriticMarkupRanges, backwards_select: boolean, state: EditorState, cat_before: null | CharCategory = null): number {
	const range_front = !backwards_select ? range.from : range.to;
	const range_back = !backwards_select ? range.to : range.from;
	const offset = !backwards_select ? 1 : -1;

	let cat_during = null;

	// If head is not PAST the back bracket
	if (!range.empty() && !range.cursor_infront(head, backwards_select)) {
		// TODO: Replace instances of state with searching through range text (cheaper)
		const cat_inside = (range.empty() || range.part_is_empty(!backwards_select)) ? null : getCharCategory(range_front + 3 * offset, state, backwards_select);
		// CASE 1: Cursor cannot enter range
		if (cat_inside !== null && cat_before !== null && cat_before !== 1 && cat_inside !== cat_before)
			return head;

		if (range.touches_bracket(head, !backwards_select))
			head = range_front + 3 * offset;

		// If inside separator, move out
		if (range.touches_separator(head))
			head = (<SubstitutionRange>range).middle + (!backwards_select ? 2 : 0);

		// Head is now guaranteed to be either in the beginning of, or inside the range
		[head, cat_during] = findBlockingChar(head, !backwards_select, state, cat_before === 1 || cat_before === null, cat_before);
		if (range.part_is_empty(backwards_select))
			cat_during = cat_before;
		else
			cat_during = getCharCategory(range_back - 4 * offset, state, backwards_select);


		if (range.touches_separator(head, true, true)) {
			if (range.part_is_empty(backwards_select)) {
				head = range_back + 3 * offset;
			} else {
				const separator_front = (<SubstitutionRange>range).middle + (!backwards_select ? 2 : 0);
				const cat_after_bracket = getCharCategory(separator_front, state, backwards_select);
				if (!((cat_during !== null && cat_during !== CharCategory.Space) && cat_during !== cat_after_bracket))
					head = findBlockingChar(separator_front, !backwards_select, state, cat_before === 1 || cat_before === null, cat_before)[0];
			}
		}


		// FIXME: is the last character before brackets always representative of the category?

		// Does not touch right bracket
		if (!range.cursor_infront(head, backwards_select))
			return head;

	}

	let adjacent_range = ranges.adjacent_range(range, backwards_select, true);
	let new_range_back = range_back;
	while (adjacent_range?.empty()) {
		new_range_back = !backwards_select ? adjacent_range.to : adjacent_range.from;
		adjacent_range = ranges.adjacent_range(adjacent_range, backwards_select, true)!;
	}


	if (!adjacent_range) {
		const cat_after = getCharCategory(new_range_back, state, backwards_select);
		if ((cat_during !== null && cat_during !== CharCategory.Space) && cat_during !== cat_after)
			return range_back - 3 * offset;
		return encountered_character(new_range_back, ranges, backwards_select, state, cat_during);
	} else {
		const adjacent_range_front = !backwards_select ? adjacent_range.from : adjacent_range.to;
		const resulting_head = encountered_range(adjacent_range_front  + 3 * offset, adjacent_range, ranges, backwards_select, state, cat_during);
		if (resulting_head === adjacent_range_front + 3 * offset)
			return range_back - 3 * offset;
		return resulting_head;
	}
}


export function cursor_move(range: EditorRange, original_range: EditorRange, ranges: CriticMarkupRanges, state: EditorState,
							backwards_select: boolean, group_select: boolean, is_selection: boolean, block_cursor = false) {
	let head = range.head!, anchor = range.anchor!;
	let cur_range = ranges.range_adjacent_to_cursor(original_range.head!, backwards_select, true, !group_select);

	// Logic should ONLY execute when cursor passes a range in some way
	// FIXME: logic should execute ONLY when cursor passes a BRACKET
	// FIXME: Up/down movement acts inconsistently (vertical position can obviously not be maintained)
	// FIXME: Block (non-group) cursor up/down movement always shows bracket characters
	// FIXME: Block (group) cursor sideways always shows bracket characters
	// FIXME: Block cursor mode skips characters INSIDE range and shows inconsistent behaviour (did not happen in previous version)
	if (cur_range && (!backwards_select ? head >= cur_range.from : head <= cur_range.to)) {
		if (group_select) {
			if (cur_range.encloses(original_range.head!)) {
				head = encountered_range(original_range.head!, cur_range, ranges, backwards_select, state);
			} else {
				head = encountered_character(original_range.head!, ranges, backwards_select, state);
			}

		} else {
			let regular_cursor = head + (!backwards_select ? -1 : 1) + (!backwards_select && block_cursor ? 1 : 0);
			if (cur_range.touches_bracket(regular_cursor, !backwards_select, true, true))
				regular_cursor = backwards_select ? cur_range.to - 3 : cur_range.from + 3;

			if (cur_range.touches_separator(regular_cursor, true, true)) {
				regular_cursor = (<SubstitutionRange>cur_range).middle + (!backwards_select ? 2 : 0)
				head = regular_cursor + (!backwards_select ? 1 : -1);
			}

			if (cur_range.touches_brackets(regular_cursor, true, true)) {
				let last_range = cur_range;

				// If at the end of a range, immediately move to the next range
				if (cur_range.touches_bracket(regular_cursor, backwards_select, true, true))
					cur_range = ranges.adjacent_range(cur_range, backwards_select, true)!;

				while (cur_range?.empty()) {
					last_range = cur_range;
					cur_range = ranges.adjacent_range(cur_range, backwards_select, true)!;
				}

				if (cur_range)
					head = !backwards_select ? cur_range.from + 4 : cur_range.to - 4;
				else
					head = !backwards_select ? Math.min(last_range.to + 1, state.doc.length) : Math.max(0, last_range.from - 1);

				if (block_cursor && !backwards_select)
					head -= 1;
			}
		}
	}

	if (!is_selection)
		anchor = head;

	return {selection: EditorSelection.range(anchor, head)};
}
