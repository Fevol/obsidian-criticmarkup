import { type ChangeSet, Text } from '@codemirror/state';

import { type CriticMarkupRange } from './base_range';

// TODO: Convert this into a B+ tree for efficient range retrieval?
// TODO: This tree should be incrementally maintained as document updates occur, rather than being constructed whenever I require all ranges
// TODO: For efficiency reasons, use reversed for loops instead of .slice().reverse().find()
export class CriticMarkupRanges {
	ranges: CriticMarkupRange[];

	constructor(ranges: CriticMarkupRange[]) {
		this.ranges = ranges;
	}

	empty() {
		return this.ranges.length === 0;
	}

	get(index: number) {
		if (index < 0)
			return this.ranges[this.ranges.length + index];
		return this.ranges[index];
	}

	// Right breaks ties if cursor between two ranges, defaults to the left range
	at_cursor(cursor: number, strict = false, right = false) {
		return right ? this.ranges.slice().reverse().find(range => range.encloses(cursor, strict))
			: this.ranges.find(range => range.encloses(cursor, strict));
	}

	between_cursor(cursor_start: number, cursor_end: number, left: boolean, loose = false) {
		const ranges = [];
		if (!left) {
			const first_range = this.ranges.findIndex(range => range.from >= cursor_start);
			for (let i = first_range; i < this.ranges.length; i++) {
				const range = this.ranges[i];
				if (loose ? range.from > cursor_end : range.from >= cursor_end)
					break;
				ranges.push(range);
			}
		} else {
			const last_range = this.ranges.reverse().slice().findIndex(range => range.to <= cursor_start);
			for (let i = last_range; i >= 0; i--) {
				const range = this.ranges[i];
				if (loose ? range.to < cursor_end : range.to <= cursor_end)
					break;
				ranges.push(range);
			}
		}
		return ranges;
	}

	contains_range(from: number, to: number) {
		return this.ranges.some(range => range.partially_in_range(from, to));
	}

	range_passes_range(from: number, to: number, left: boolean) {
		if (left)
			return this.ranges.slice().reverse().find(range => (from >= range.to && range.to >= to) || (from > range.from && range.from >= to));
		else
			return this.ranges.find(range => (from <= range.from && range.from <= to) || (from < range.to && range.to <= to));
	}

	between_two_ranges(cursor: number) {
		// Might be a bit more efficient, but only used for a test case a.t.m.
		const left_range = this.at_cursor(cursor, false, true);
		const right_range = this.at_cursor(cursor, false, false);
		return left_range && right_range && left_range.to === right_range.from;
	}

	near_cursor(cursor: number, left: boolean) {
		if (left)
			return this.ranges.slice().reverse().find(range => range.to <= cursor);
		else
			return this.ranges.find(range => cursor <= range.from);
	}

	directly_adjacent_to_cursor(cursor: number, left: boolean) {
		return this.ranges.find(range => left ? range.to === cursor : range.from === cursor);
	}


	/**
	 * Get the range that is (not directly) adjacent to the cursor in given direction
	 * @param cursor - Cursor position in the document
	 * @param left - Whether to look left or right of the cursor
	 * @param loose - Whether to include ranges that are partially adjacent to the cursor
	 * @param include_edge - Whether to include the edges of the range
	 */
	range_adjacent_to_cursor(cursor: number, left: boolean, loose = false, include_edge = false) {
		const ranges = (left ? this.ranges.slice().reverse() : this.ranges);
		if (include_edge)
			return ranges.find(range => left ? ((loose ? range.from : range.to) < cursor) : (cursor < (loose ? range.to : range.from)));
		return ranges.find(range => left ? ((loose ? range.from : range.to) <= cursor) : (cursor <= (loose ? range.to : range.from)));
	}

	adjacent_range(range: CriticMarkupRange, left: boolean, directly_adjacent = false) {
		const range_idx = this.ranges.findIndex(n => n === range);
		if (range_idx === -1)
			return undefined;
		const adjacent = left ? this.ranges[range_idx - 1] : this.ranges[range_idx + 1];
		if (!adjacent)
			return undefined;

		if (directly_adjacent) {
			if (left ? adjacent.to === range.from : range.to === adjacent.from)
				return adjacent;
		} else {
			return adjacent;
		}
		return undefined;
	}

	ranges_in_range(start: number, end: number, partial = true) {
		if (partial)
			return this.ranges.filter(range => range.partially_in_range(start, end));
		return this.ranges.filter(range => range.fully_in_range(start, end));
	}

	filter_range(start: number, end: number, partial = true) {
		return new CriticMarkupRanges(this.ranges_in_range(start, end, partial));
	}

	get_sibling(range: CriticMarkupRange, left: boolean) {
		const index = this.ranges.indexOf(range);
		if (left)
			return this.ranges[index - 1];
		return this.ranges[index + 1];
	}

	num_ignored_chars_range(start: number, to: number, ranges: CriticMarkupRange[] | null = null) {
		if (!ranges)
			ranges = this.ranges_in_range(start, to, true);
		if (!ranges.length) return 0;
		let left_range: CriticMarkupRange | undefined, right_range: CriticMarkupRange | undefined;
		if (ranges[0].encloses(start))
			left_range = ranges.shift();
		if (ranges[ranges.length - 1]?.encloses(to))
			right_range = ranges.pop();

		return {
			num_ignored_chars: ranges.reduce((acc, range) => acc + range.num_ignore_chars, 0),
			left_range, right_range,
		};


	}

	unwrap_in_range(doc: Text, from = 0, to = doc.length, ranges: CriticMarkupRange[] | null = null):
		{output: string, from: number, to: number, front_range?: CriticMarkupRange, back_range?: CriticMarkupRange} {
		const str = doc.toString();

		const string_in_range = str.slice(from, to);
		let front_range: undefined | CriticMarkupRange, back_range: undefined | CriticMarkupRange;

		if (!ranges)
			ranges = this.ranges_in_range(from, to, true);

		if (ranges.length === 0)
			return { output: string_in_range, from, to };

		let output = '';
		if (from < ranges[0].from)
			output += str.slice(from, ranges[0].from);
		else
			front_range = ranges[0];

		let prev_range = -1;
		for (const range of ranges) {
			if (prev_range !== -1)
				output += str.slice(prev_range, range.from);
			output += range.unwrap_slice(Math.max(0, from - range.from), to - range.from);
			prev_range = range.to;
		}

		if (to >= ranges.at(-1)!.to)
			output += str.slice(ranges.at(-1)!.to, to);
		else
			back_range = ranges.at(-1)!;


		const new_from = front_range ? front_range.cursor_move_outside(from, true) : from;
		const new_to = back_range ? back_range.cursor_move_outside(to, false) : to;
		if (new_from !== from || from === front_range?.from) front_range = undefined;
		if (new_to !== to || to === back_range?.to) back_range = undefined;

		return {
			output,
			from: new_from,
			to: new_to,
			front_range,
			back_range
		};
	}

	applyChanges(changes: ChangeSet) {
		const ranges: CriticMarkupRange[] = [];
		for (const range of this.ranges) {
			const new_range = range.copy();
			new_range.apply_change(changes);
			ranges.push(new_range);
		}
		return new CriticMarkupRanges(ranges);
	}
}
