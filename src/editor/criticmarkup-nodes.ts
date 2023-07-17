import { Text } from '@codemirror/state';
import { CM_All_Brackets } from '../util';

export type NodeType = 'Addition' | 'Deletion' | 'Substitution' | 'Highlight' | 'Comment';

export abstract class CriticMarkupNode {
	from: number;
	to: number;
	type: NodeType;

	constructor(from: number, to: number, type: NodeType) {
		this.from = from;
		this.to = to;
		this.type = type;
	}

	empty() {
		return this.from + 3 === this.to - 3;
	}

	text(str: string, offset = 0) {
		return str.slice(Math.max(this.from - offset, 0), Math.min(this.to - offset, str.length));
	}

	unwrap(str: string, offset = 0) {
		return str.slice(Math.max(this.from - offset + 3, 0), Math.min(this.to - offset - 3, str.length));
	}

	in_range(start: number, end: number) {
		return this.from >= start && this.to <= end;
	}

	partially_in_range(start: number, end: number) {
		return this.from < end && start < this.to;
	}

	encloses(cursor: number) {
		return this.from <= cursor && this.to >= cursor;
	}

	encloses_range(start: number, end: number) {
		return this.from <= start && this.to >= end;
	}

	accept(str: string, offset = 0) {
		return this.text(str, offset);
	}

	reject(str: string, offset = 0) {
		return this.text(str, offset);
	}

	touches(cursor: number) {
		return this.from === cursor || this.to === cursor;
	}

	// TODO: Remove additional condition params if they're not used
	cursor_inside(cursor: number) {
		return this.from + 3 < cursor && this.to - 3 > cursor;
	}

	cursor_infront(cursor: number, left: boolean) {
		return left ? cursor <= this.from + 3 : cursor >= this.to - 3;
	}

	cursor_behind(cursor: number, left: boolean) {
		return left ? cursor >= this.from + 3 : cursor <= this.to - 3;
	}

	touches_left_bracket(cursor: number, outside_loose = false, inside_loose = false) {
		return cursor + (outside_loose ? 0 : 1) >= this.from && cursor + (inside_loose ? 0 : 1) <= this.from + 3;
		// if (outside_loose)
		// 	return cursor + (block_cursor ? 1 : 0) >= this.from && cursor <= this.from + 3;
		// return cursor > this.from && cursor < this.from + 3;
	}

	touches_right_bracket(cursor: number, outside_loose = false, inside_loose = false) {
		return cursor - (inside_loose ? 0 : 1) >= this.to - 3 && cursor - (outside_loose ? 0 : 1) <= this.to;
		// return cursor + (block_cursor ? 1 : 0) - (inside_loose ? 0 : 1) >= this.to - 3 && cursor + (outside_loose ? 0 : 1) <= this.to;
		// if (outside_loose)
		// 	return cursor + (block_cursor ? 1 : 0)>= this.to - 3 && cursor <= this.to;
		// return cursor > this.to - 3  && cursor < this.to;
	}

	touches_bracket(cursor: number, left: boolean, outside_loose = false, inside_loose = false) {
		return left ? this.touches_left_bracket(cursor, outside_loose, inside_loose) :
					  this.touches_right_bracket(cursor, outside_loose, inside_loose);
	}

	touches_brackets(cursor: number, outside_loose = false, inside_loose = false) {
		return this.touches_left_bracket(cursor, outside_loose, inside_loose)
			|| this.touches_right_bracket(cursor, outside_loose, inside_loose);
	}

}

export class AdditionNode extends CriticMarkupNode {
	constructor(from: number, to: number) {
		super(from, to, 'Addition');
	}

	accept(str: string, offset = 0) {
		return this.unwrap(str, offset);
	}

	reject(str: string, offset = 0) {
		return '';
	}
}

export class DeletionNode extends CriticMarkupNode {
	constructor(from: number, to: number) {
		super(from, to, 'Deletion');
	}

	accept(str: string, offset = 0) {
		return '';
	}

	reject(str: string, offset = 0) {
		return this.unwrap(str, offset);
	}
}

export class SubstitutionNode extends CriticMarkupNode {
	middle: number;

	constructor(from: number, middle: number, to: number) {
		super(from, to, 'Substitution');
		this.middle = middle;
	}

	accept(str: string, offset = 0) {
		return this.unwrap(str, offset).slice(0, this.middle - this.from - 3);
	}

	reject(str: string, offset = 0) {
		return this.unwrap(str, offset).slice(this.middle - this.from - 3);
	}
}

export class HighlightNode extends CriticMarkupNode {
	constructor(from: number, to: number) {
		super(from, to, 'Highlight');
	}
}

export class CommentNode extends CriticMarkupNode {
	constructor(from: number, to: number) {
		super(from, to, 'Comment');
	}
}



export function constructNode(from: number, to: number, type: string, middle?: number) {
	switch (type) {
		case 'Addition':
			return new AdditionNode(from, to);
		case 'Deletion':
			return new DeletionNode(from, to);
		case 'Substitution':
			return new SubstitutionNode(from, middle!, to);
		case 'Highlight':
			return new HighlightNode(from, to);
		case 'Comment':
			return new CommentNode(from, to);
	}
}




// TODO: Convert this into a B+ tree for efficient node retrieval?
// TODO: This tree should be incrementally maintained as document updates occur, rather than being constructed whenever I require all nodes
export class CriticMarkupNodes {
	nodes: CriticMarkupNode[];

	constructor(nodes: CriticMarkupNode[]) {
		this.nodes = nodes;
	}

	get(index: number) {
		if (index < 0)
			return this.nodes[this.nodes.length + index];
		return this.nodes[index];
	}

	at_cursor(cursor: number, left_loose = false, right_loose = false) {
		return this.nodes.find(node => node.from - (left_loose ? 1 : 0) <= cursor && node.to - (right_loose ? 1 : 0) >= cursor);
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

	range_passes_node(from: number, to: number, left: boolean) {
		if (left)
			return this.nodes.slice().reverse().find(node => (from >= node.to && node.to >= to) || (from > node.from && node.from >= to));
		else
			return this.nodes.find(node => (from <= node.from && node.from <= to) || (from < node.to && node.to <= to));
	}

	between_two_nodes(cursor: number) {
		// Might be a bit more efficient, but only used for a test case a.t.m.
		const left_node = this.at_cursor(cursor, false, true);
		const right_node = this.at_cursor(cursor, true, false);
		return left_node && right_node && left_node.to === right_node.from;
	}

	near_cursor(cursor: number, left: boolean) {
		if (left)
			return this.nodes.slice().reverse().find(node => node.to <= cursor);
		else
			return this.nodes.find(node => cursor <= node.from);
	}

	adjacent_to_cursor(cursor: number, left: boolean, loose = false, strict = false) {
		const nodes = (left ? this.nodes.slice().reverse() : this.nodes)
		if (strict)
			return nodes.find(node => left ? ((loose ? node.from : node.to) < cursor) : (cursor < (loose ? node.to : node.from)) );
		return nodes.find(node => left ? ((loose ? node.from : node.to) <= cursor) : (cursor <= (loose ? node.to : node.from)) );

		// if (left)
		// 	return this.nodes.slice().reverse().find(node => (loose ? node.from : node.to) <= cursor);
		// return this.nodes.find(node => cursor <= (loose ? node.to : node.from));
	}

	adjacent_to_node(node: CriticMarkupNode, left: boolean, directly_adjacent = false) {
		const node_idx = this.nodes.findIndex(n => n === node);
		if (node_idx === -1)
			return null;
		const adjacent = left ? this.nodes[node_idx - 1] : this.nodes[node_idx + 1];
		if (!adjacent)
			return null;

		if (directly_adjacent) {
			if (adjacent && left ? adjacent.to === node.from : node.to === adjacent.from)
				return adjacent;
		} else {
			return adjacent;
		}
		return null;
	}

	filter_range(start: number, end: number, partial = true) {
		if (partial)
			return new CriticMarkupNodes(this.nodes.filter(node => node.partially_in_range(start, end)));
		return new CriticMarkupNodes(this.nodes.filter(node => node.in_range(start, end)));
	}

	get_sibling(node: CriticMarkupNode, left: boolean) {
		const index = this.nodes.indexOf(node);
		if (left)
			return this.nodes[index - 1];
		return this.nodes[index + 1];
	}

	unwrap_in_range(str: string, start = 0, to = start + str.length, type: string, doc: Text) {
		if (this.nodes.length === 0)
			return { output: str, start, to, prefix: '', suffix: '', offset: 0 };

		let extended_range = false;
		let new_start = start;
		let new_to = to;

		if (this.nodes[0].from < start) {
			new_start = this.nodes[0].from;
			extended_range = true;
		}
		if (this.nodes.at(-1)!.to > to) {
			new_to = this.nodes[this.nodes.length - 1].to;
			extended_range = true;
		}

		if (extended_range)
			str = doc.sliceString(new_start, new_to);

		let prefix = '';
		let suffix = '';
		let output = '';
		let offset = -6 * this.nodes.length;

		for (const [idx, node] of this.nodes.entries()) {
			if (extended_range && (!idx || idx === this.nodes.length - 1)) {
				if (node.type !== type && new_start !== start && start - node.from > 3) {
					const text = node.text(str, new_start);
					prefix = text.slice(0, start - node.from) + CM_All_Brackets[node.type].at(-1);
					output += text.slice(start - node.from, -3);
					offset += 6;
				} else if (node.type !== type && new_to !== to && node.to - to > 3) {
					const text = node.text(str, new_start);
					output += text.slice(3, to - node.from);
					suffix = CM_All_Brackets[node.type].at(0) + text.slice(to - node.from);
					offset += 3;
				} else {
					output += node.unwrap(str, new_start);
				}
			} else {
				output += node.unwrap(str, new_start);
			}

			if (idx !== this.nodes.length - 1)
				output += str.slice(node.to - new_start, this.nodes[idx + 1].from - new_start);
		}

		if (!prefix)
			output = str.slice(0, this.nodes[0].from - new_start) + output;
		if (!suffix)
			output += str.slice(this.nodes.at(-1)!.to - new_start);

		return {
			output,
			prefix,
			suffix,
			start: new_start,
			to: new_to,
			offset,
		};
	}
}

