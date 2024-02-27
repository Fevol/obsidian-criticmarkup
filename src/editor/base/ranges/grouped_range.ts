import { type ChangeSet, Text } from '@codemirror/state';
import { type CriticMarkupRange } from './base_range';
import IntervalTree, {Node} from "@flatten-js/interval-tree";


IntervalTree.prototype.tree_search_nearest_backward = function <T>(node: Node<T>, search_node: Node<any>): Node<T> | null {
	let best;
	let curr = node;
	while (curr && curr !== this.nil_node) {
		if (!curr.less_than(search_node)) {
			if (curr.intersect(search_node)) {
				best = curr;
				curr = curr.right;
			} else {
				curr = curr.left;
			}
		} else {
			if (!best || !curr.less_than(best)) best = curr;
			curr = curr.right;
		}
	}
	return best || null;

}


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
		// Array-based version is consistently faster than tree-based version (only exception: stresstest on end of note)
		// const node = (left ? this.tree.tree_search_nearest_backward(this.tree.root!, new Node([cursor, cursor])) :
		// 												this.tree.tree_search_nearest_forward(this.tree.root!, new Node([cursor, cursor])))?.item.value;

		const ranges = (left ? this.ranges.slice().reverse() : this.ranges);
		if (include_edge)
			return ranges.find(range => left ? ((loose ? range.from : range.to) < cursor) : (cursor < (loose ? range.to : range.from)));
		else
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

	ranges_in_range(start: number, end: number) {
		return this.tree.search([start, end]) as CriticMarkupRange[];
	}

	unwrap_in_range(doc: Text, from = 0, to = doc.length, ranges: CriticMarkupRange[] | null = null):
		{output: string, from: number, to: number, front_range?: CriticMarkupRange, back_range?: CriticMarkupRange} {
		let front_range: undefined | CriticMarkupRange, back_range: undefined | CriticMarkupRange;

		if (!ranges)
			ranges = this.ranges_in_range(from, to);

		if (ranges.length === 0)
			return { output: doc.sliceString(from, to), from, to };

		let output = '';
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


		const new_from = front_range ? front_range.cursor_move_outside_dir(from, true) : from;
		const new_to = back_range ? back_range.cursor_move_outside_dir(to, false) : to;
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
