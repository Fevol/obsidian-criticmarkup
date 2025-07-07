import { Text } from "@codemirror/state";
import IntervalTree from "@flatten-js/interval-tree";
import { type CriticMarkupRange } from "./base_range";

export class CriticMarkupRanges {
	ranges: CriticMarkupRange[];
	tree: IntervalTree<CriticMarkupRange>;

	constructor(ranges: CriticMarkupRange[]) {
		this.ranges = ranges;
		this.tree = new IntervalTree();
		for (const range of ranges)
			this.tree.insert([range.from, range.to], range);
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
	at_cursor(cursor: number, right = false): CriticMarkupRange | undefined {
		const search = this.tree.search([cursor, cursor]);
		return search.length ? (right && search.length > 1) ? search[1] : search[0] : undefined;
	}

	contains_range(from: number, to: number): boolean {
		return this.tree.intersect_any([from, to]);
	}

	/**
	 * Get the range that is (not directly) adjacent to the cursor in given direction
	 * @param cursor - Cursor position in the document
	 * @param left - Whether to look left or right of the cursor
	 * @param loose - Whether to include ranges that are partially adjacent to the cursor
	 * @param include_edge - Whether to include the edges of the range
	 */
	range_adjacent_to_cursor(cursor: number, left: boolean, loose = false, include_edge = false) {
		const ranges = left ? this.ranges.slice().reverse() : this.ranges;
		if (include_edge) {
			return ranges.find(range =>
				left ? ((loose ? range.from : range.to) < cursor) : (cursor < (loose ? range.to : range.from))
			);
		} else {
			return ranges.find(range =>
				left ? ((loose ? range.from : range.to) <= cursor) : (cursor <= (loose ? range.to : range.from))
			);
		}
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

	ranges_in_interval(start: number, end: number) {
		return this.tree.search([start, end]) as CriticMarkupRange[];
	}

	ranges_in_intervals(intervals: { from: number; to: number }[]) {
		const unique_ranges = new Set<CriticMarkupRange>();
		for (const range of intervals) {
			for (const found_range of this.tree.search([range.from, range.to]) as CriticMarkupRange[]) {
				unique_ranges.add(found_range);
				if (found_range.base_range) {
					unique_ranges.add(found_range.base_range);
					for (const reply of found_range.base_range.replies) {
						unique_ranges.add(reply);
					}
				}
			}
		}
		return Array.from(unique_ranges).sort((a, b) => a.from - b.from);
	}

	// ranges_fully_in_range(start: number, end: number) {
	// 	const ranges = this.ranges_in_range(start, end);
	// 	if (ranges[ranges.length - 1]?.touches_left_bracket(start, false, true, true))
	// 		ranges.pop();
	// 	if (ranges[0]?.touches_right_bracket(end, false, true))
	// 		ranges.shift();
	// 	return ranges;
	// }

	unwrap_in_range(
		doc: Text,
		from = 0,
		to = doc.length,
		ranges: CriticMarkupRange[] | null = null,
	): { output: string; from: number; to: number; front_range?: CriticMarkupRange; back_range?: CriticMarkupRange } {
		let front_range: undefined | CriticMarkupRange, back_range: undefined | CriticMarkupRange;

		if (!ranges)
			ranges = this.ranges_in_interval(from, to);

		if (ranges.length === 0)
			return { output: doc.sliceString(from, to), from, to };

		let output = "";
		if (from < ranges[0].from)
			output += doc.sliceString(from, ranges[0].from);
		else
			front_range = ranges[0];

		let prev_range = -1;
		for (const range of ranges) {
			if (prev_range !== -1)
				output += doc.sliceString(prev_range, range.from);
			output += range.unwrap_slice(Math.max(0, from), to);
			prev_range = range.to;
		}

		if (to >= ranges.at(-1)!.to)
			output += doc.sliceString(ranges.at(-1)!.to, to);
		else
			back_range = ranges.at(-1)!;

		const new_from = front_range ? front_range.cursor_pass_syntax(from, false) : from;
		const new_to = back_range ? back_range.cursor_pass_syntax(to, true) : to;
		if (new_from !== from || from === front_range?.from) front_range = undefined;
		if (new_to !== to || to === back_range?.to) back_range = undefined;

		return {
			output,
			from: new_from,
			to: new_to,
			front_range,
			back_range,
		};
	}
}
