import { type ChangeSet, Text } from '@codemirror/state';

import { type CriticMarkupNode } from './base-node';

// TODO: Convert this into a B+ tree for efficient node retrieval?
// TODO: This tree should be incrementally maintained as document updates occur, rather than being constructed whenever I require all nodes
// TODO: For efficiency reasons, use reversed for loops instead of .slice().reverse().find()
export class CriticMarkupNodes {
	nodes: CriticMarkupNode[];

	constructor(nodes: CriticMarkupNode[]) {
		this.nodes = nodes;
	}

	empty() {
		return this.nodes.length === 0;
	}

	get(index: number) {
		if (index < 0)
			return this.nodes[this.nodes.length + index];
		return this.nodes[index];
	}

	// Right breaks ties if cursor between two nodes, defaults to the left node
	at_cursor(cursor: number, strict = false, right = false) {
		return right ? this.nodes.slice().reverse().find(node => node.encloses(cursor, strict))
			: this.nodes.find(node => node.encloses(cursor, strict));
	}

	between_cursor(cursor_start: number, cursor_end: number, left: boolean, loose = false) {
		const nodes = [];
		if (!left) {
			const first_node = this.nodes.findIndex(node => node.from >= cursor_start);
			for (let i = first_node; i < this.nodes.length; i++) {
				const node = this.nodes[i];
				if (loose ? node.from > cursor_end : node.from >= cursor_end)
					break;
				nodes.push(node);
			}
		} else {
			const last_node = this.nodes.reverse().slice().findIndex(node => node.to <= cursor_start);
			for (let i = last_node; i >= 0; i--) {
				const node = this.nodes[i];
				if (loose ? node.to < cursor_end : node.to <= cursor_end)
					break;
				nodes.push(node);
			}
		}
		return nodes;
	}

	range_contains_node(from: number, to: number) {
		return this.nodes.some(node => node.partially_in_range(from, to));
	}

	range_passes_node(from: number, to: number, left: boolean) {
		if (left)
			return this.nodes.slice().reverse().find(node => (from >= node.to && node.to >= to) || (from > node.from && node.from >= to));
		else
			return this.nodes.find(node => (from <= node.from && node.from <= to) || (from < node.to && node.to <= to));
	}

	between_two_nodes(cursor: number) {
		// Might be a bit more efficient, but only used for a test case a.t.m.
		const left_node = this.at_cursor(cursor, false, true);
		const right_node = this.at_cursor(cursor, false, false);
		return left_node && right_node && left_node.to === right_node.from;
	}

	near_cursor(cursor: number, left: boolean) {
		if (left)
			return this.nodes.slice().reverse().find(node => node.to <= cursor);
		else
			return this.nodes.find(node => cursor <= node.from);
	}

	directly_adjacent_to_cursor(cursor: number, left: boolean) {
		return this.nodes.find(node => left ? node.to === cursor : node.from === cursor);
	}

	adjacent_to_cursor(cursor: number, left: boolean, loose = false, strict = false) {
		const nodes = (left ? this.nodes.slice().reverse() : this.nodes);
		if (strict)
			return nodes.find(node => left ? ((loose ? node.from : node.to) < cursor) : (cursor < (loose ? node.to : node.from)));
		return nodes.find(node => left ? ((loose ? node.from : node.to) <= cursor) : (cursor <= (loose ? node.to : node.from)));
	}

	adjacent_to_node(node: CriticMarkupNode, left: boolean, directly_adjacent = false) {
		const node_idx = this.nodes.findIndex(n => n === node);
		if (node_idx === -1)
			return null;
		const adjacent = left ? this.nodes[node_idx - 1] : this.nodes[node_idx + 1];
		if (!adjacent)
			return null;

		if (directly_adjacent) {
			if (left ? adjacent.to === node.from : node.to === adjacent.from)
				return adjacent;
		} else {
			return adjacent;
		}
		return null;
	}

	nodes_in_range(start: number, end: number, partial = true) {
		if (partial)
			return this.nodes.filter(node => node.partially_in_range(start, end));
		return this.nodes.filter(node => node.fully_in_range(start, end));
	}

	filter_range(start: number, end: number, partial = true) {
		return new CriticMarkupNodes(this.nodes_in_range(start, end, partial));
	}

	get_sibling(node: CriticMarkupNode, left: boolean) {
		const index = this.nodes.indexOf(node);
		if (left)
			return this.nodes[index - 1];
		return this.nodes[index + 1];
	}

	num_ignored_chars_range(start: number, to: number, nodes: CriticMarkupNode[] | null = null) {
		if (!nodes)
			nodes = this.nodes_in_range(start, to, true);
		if (!nodes.length) return 0;
		let left_node: CriticMarkupNode | undefined, right_node: CriticMarkupNode | undefined;
		if (nodes[0].encloses(start))
			left_node = nodes.shift();
		if (nodes[nodes.length - 1]?.encloses(to))
			right_node = nodes.pop();

		return {
			num_ignored_chars: nodes.reduce((acc, node) => acc + node.num_ignore_chars, 0),
			left_node, right_node,
		};


	}

	unwrap_in_range(doc: Text, from = 0, to = doc.length, nodes: CriticMarkupNode[] | null = null):
		{output: string, from: number, to: number, front_node?: CriticMarkupNode, back_node?: CriticMarkupNode} {
		const str = doc.toString();

		const string_in_range = str.slice(from, to);
		let front_node: undefined | CriticMarkupNode, back_node: undefined | CriticMarkupNode;

		if (!nodes)
			nodes = this.nodes_in_range(from, to, true);

		if (nodes.length === 0)
			return { output: string_in_range, from, to };

		let output = '';
		if (from < nodes[0].from)
			output += str.slice(from, nodes[0].from);
		else
			front_node = nodes[0];

		let prev_node = -1;
		for (const node of nodes) {
			if (prev_node !== -1)
				output += str.slice(prev_node, node.from);
			output += node.unwrap_slice(Math.max(0, from - node.from), to - node.from);
			prev_node = node.to;
		}

		if (to >= nodes.at(-1)!.to)
			output += str.slice(nodes.at(-1)!.to, to);
		else
			back_node = nodes.at(-1)!;


		const new_from = front_node ? front_node.cursor_move_outside(from, true) : from;
		const new_to = back_node ? back_node.cursor_move_outside(to, false) : to;
		if (new_from !== from || from === front_node?.from) front_node = undefined;
		if (new_to !== to || to === back_node?.to) back_node = undefined;

		return {
			output,
			from: new_from,
			to: new_to,
			front_node,
			back_node
		};
	}

	applyChanges(changes: ChangeSet) {
		const nodes: CriticMarkupNode[] = [];
		for (const node of this.nodes) {
			const new_node = node.copy();
			new_node.apply_change(changes);
			nodes.push(new_node);
		}
		return new CriticMarkupNodes(nodes);
	}
}
