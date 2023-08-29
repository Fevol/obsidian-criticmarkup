import { Text } from '@codemirror/state';
import { type StringNodeType, NodeType } from '../types';
import { CM_All_Brackets } from '../util';

export abstract class CriticMarkupNode {
	from: number;
	to: number;
	type: NodeType;
	repr: StringNodeType;
	num_ignore_chars = 6;

	constructor(from: number, to: number, type: NodeType, repr: StringNodeType) {
		this.from = from;
		this.to = to;
		this.type = type;
		this.repr = repr;
	}

	copy(): CriticMarkupNode {
		return Object.assign(Object.create(Object.getPrototypeOf(this)), this);
	}

	equals(other: CriticMarkupNode) {
		return this.from === other.from && this.to === other.to && this.type === other.type;
	}

	num_ignored_chars(from: number, to: number): number {
		if (from >= this.to || to <= this.from || this.encloses_range(from, to)) return 0;
		if (this.fully_in_range(from, to)) return 6;
		return 3;
	}

	part_is_empty(left: boolean) {
		return false;
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

	unwrap_bracket(str: string, left = false, offset = 0) {
		if (left) {
			return str.slice(Math.max(this.from - offset + 3, 0));
		} else {
			return str.slice(0, Math.min(this.to - offset - 3, str.length));
		}
	}

	unwrap_parts(str: string, offset = 0): string[] {
		return [this.unwrap(str, offset)];
	}

	unwrap_slice(str: string, from: number, to: number) {
		return str.slice(Math.max(this.from + 3, from), Math.min(this.to - 3, to));
	}


	fully_in_range(start: number, end: number, strict = false) {
		if (strict)
			return this.from + 3 >= start && this.to - 3 <= end;
		return this.from >= start && this.to <= end;
	}

	partially_in_range(start: number, end: number) {
		// return this.from < end && start < this.to;
		return !(start > this.to || end < this.from);
	}

	encloses(cursor: number, strict = false) {
		if (strict) return this.from < cursor && this.to > cursor;
		return this.from <= cursor && this.to >= cursor;
	}

	encloses_range(start: number, end: number, strict = false) {
		if (strict) return this.from < start && this.to > end;
		return this.from <= start && this.to >= end;
	}

	part_encloses_range(start: number, end: number, left: boolean) {
		return this.encloses_range(start, end);
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

	cursor_outside(cursor: number, left: boolean) {
		return left ? cursor <= this.from : cursor >= this.to;
	}


	cursor_infront(cursor: number, left: boolean, strict = false) {
		if (strict)
			return left ? cursor < this.from + 3 : cursor > this.to - 3;
		return left ? cursor <= this.from + 3 : cursor >= this.to - 3;
	}

	cursor_behind(cursor: number, left: boolean, strict = false) {
		if (strict)
			return left ? cursor > this.from + 3 : cursor < this.to - 3;
		return left ? cursor >= this.from + 3 : cursor <= this.to - 3;
	}

	cursor_move_outside(cursor: number, left: boolean): number {
		if (left) {
			if (this.touches_right_bracket(cursor, true, false))
				cursor = this.to - 3;
			if (this.touches_left_bracket(cursor, false, true))
				cursor = this.from;
		} else {
			if (this.touches_left_bracket(cursor, true, false))
				cursor = this.from + 3;
			if (this.touches_right_bracket(cursor, false, true))
				cursor = this.to;
		}

		return cursor;
	}

	cursor_move_inside(cursor: number, left: boolean) {
		if (left) {
			if (this.touches_left_bracket(cursor, true, false))
				cursor = this.from + 3;
		} else {
			if (this.touches_right_bracket(cursor, true, false))
				cursor = this.to - 3;
		}
		return cursor;
	}


	touches_left_bracket(cursor: number, outside_loose = false, inside_loose = false) {
		return cursor + (outside_loose ? 0 : 1) >= this.from && cursor + (inside_loose ? 0 : 1) <= this.from + 3;
	}

	touches_separator(cursor: number, left_loose = false, right_loose = false) {
		return false;
	}

	touches_right_bracket(cursor: number, outside_loose = false, inside_loose = false) {
		return cursor - (inside_loose ? 0 : 1) >= this.to - 3 && cursor - (outside_loose ? 0 : 1) <= this.to;
	}

	touches_bracket(cursor: number, left: boolean, outside_loose = false, inside_loose = false) {
		return left ? this.touches_left_bracket(cursor, outside_loose, inside_loose) :
			this.touches_right_bracket(cursor, outside_loose, inside_loose);
	}

	touches_brackets(cursor: number, outside_loose = false, inside_loose = false) {
		return this.touches_left_bracket(cursor, outside_loose, inside_loose)
			|| this.touches_right_bracket(cursor, outside_loose, inside_loose);
	}


	postprocess(str: string, unwrap: boolean = true, livepreview_mode: number = 0, tag: string = "div", left: boolean | null = null) {
		if (unwrap) {
			// Node is larger than what is actually given (no end bracket found within text)
			if (this.to >= str.length && !str.endsWith(CM_All_Brackets[this.type].at(-1)!))
				str = this.unwrap_bracket(str, true);
			/*else if (this.from === 0 && !str.startsWith(CM_All_Brackets[this.type][0]))
				str = this.unwrap_bracket(str, false);*/
			else
				str = this.unwrap(str);
		}

		return `<${tag} class='criticmarkup-${this.repr.toLowerCase()}'>${str}</${tag}>`;
	}

}

export class AdditionNode extends CriticMarkupNode {
	constructor(from: number, to: number) {
		super(from, to, NodeType.ADDITION, 'Addition');
	}

	accept(str: string, offset = 0) {
		return this.unwrap(str, offset);
	}

	reject(str: string, offset = 0) {
		return '';
	}

	postprocess(str: string, unwrap: boolean = true, livepreview_mode: number = 0, tag: string = "div", left: boolean | null = null) {
		if (unwrap) {
			// Node is larger than what is actually given (no end bracket found within text)
			if (this.to >= str.length && !str.endsWith(CM_All_Brackets[this.type].at(-1)!))
				str = this.unwrap_bracket(str, true);
			/*else if (this.from === 0 && !str.startsWith(CM_All_Brackets[this.type][0]))
				str = this.unwrap_bracket(str, false);*/
			else
				str = this.unwrap(str);
		}
		if (!livepreview_mode)
			str = `<${tag} class='criticmarkup-preview criticmarkup-addition'>${str}</${tag}>`;
		else if (livepreview_mode === 1)
			str = `<${tag} class='criticmarkup-preview'>${str}</${tag}>`;
		else
			str = `<${tag} class='criticmarkup-preview'/>`;
		return str;
	}
}

export class DeletionNode extends CriticMarkupNode {
	constructor(from: number, to: number) {
		super(from, to, NodeType.DELETION, 'Deletion');
	}

	accept(str: string, offset = 0) {
		return '';
	}

	reject(str: string, offset = 0) {
		return this.unwrap(str, offset);
	}

	postprocess(str: string, unwrap: boolean = true, livepreview_mode: number = 0, tag: string = "div", left: boolean | null = null) {
		if (unwrap) {
			// Node is larger than what is actually given (no end bracket found within text)
			if (this.to >= str.length && !str.endsWith(CM_All_Brackets[this.type].at(-1)!))
				str = this.unwrap_bracket(str, true);
			/*else if (this.from === 0 && !str.startsWith(CM_All_Brackets[this.type][0]))
				str = this.unwrap_bracket(str, false);*/
			else
				str = this.unwrap(str);
		}
		if (!livepreview_mode)
			str = `<${tag} class='criticmarkup-preview criticmarkup-deletion'>${str}</${tag}>`;
		else if (livepreview_mode === 1)
			str = `<${tag} class='criticmarkup-preview'/>`;
		else
			str = `<${tag} class='criticmarkup-preview'>${str}</${tag}>`;
		return str;
	}
}

export class SubstitutionNode extends CriticMarkupNode {
	middle: number;
	num_ignore_chars = 8;

	constructor(from: number, middle: number, to: number) {
		super(from, to, NodeType.SUBSTITUTION, 'Substitution');
		this.middle = middle;
	}

	num_ignored_chars(from: number, to: number): number {
		if (to <= this.from || from >= this.to)
			return 0;
		if (to <= this.from + 3 || from >= this.to - 3)
			return 3;
		if (to <= this.middle + 2 || from >= this.middle)
			return 5;
		return 8;
	}

	unwrap(str: string, offset = 0) {
		return str.slice(Math.max(this.from - offset + 3, 0), this.middle - offset) +
			str.slice(this.middle - offset + 2, Math.min(this.to - offset - 3, str.length));
	}

	unwrap_parts(str: string, offset = 0) {
		return [
			str.slice(Math.max(this.from - offset + 3, 0), this.middle - offset),
			str.slice(this.middle - offset + 2, Math.min(this.to - offset - 3, str.length)),
		];
	}

	unwrap_parts_bracket(str: string, left: boolean, offset = 0) {
		if (left) {
			return [
				str.slice(Math.max(this.from + 3 - offset, 0), this.middle - offset),
				str.slice(this.middle - offset + 2),
			]
		} else {
			return [
				str.slice(this.from, this.middle - offset),
				str.slice(this.middle - offset + 2, this.to - offset - 3),
			]
		}
	}

	unwrap_slice(str: string, from: number, to: number) {
		if (from >= this.middle)
			return str.slice(Math.max(this.middle + 2, from), Math.min(this.to - 3, to));
		if (to <= this.middle)
			return str.slice(Math.max(this.from + 3, from), Math.min(this.middle, to));
		return str.slice(Math.max(this.from + 3, from), this.middle) +
			str.slice(this.middle + 2, Math.min(this.to - 3, to));
	}


	accept(str: string, offset = 0) {
		return this.unwrap(str, offset).slice(0, this.middle - this.from - 3);
	}

	touches_separator(cursor: number, left_loose = false, right_loose = false) {
		return cursor + (left_loose ? 0 : 1) >= this.middle && cursor - (right_loose ? 0 : 1) <= this.middle + 2;
	}

	cursor_move_outside(cursor: number, left: boolean) {
		if (left) {
			if (this.touches_right_bracket(cursor, true, false))
				cursor = this.to - 3;
			if (this.touches_separator(cursor, true, true))
				cursor = this.middle;
			if (this.touches_left_bracket(cursor, false, true)) {
				cursor = this.from;
			}
		} else {
			if (this.touches_left_bracket(cursor, true, false))
				cursor = this.from + 3;
			if (this.touches_separator(cursor, true, true))
				cursor = this.middle + 2;
			if (this.touches_right_bracket(cursor, false, true))
				cursor = this.to;
		}
		return cursor;
	}

	part_encloses_range(start: number, end: number, left: boolean): boolean {
		if (left)
			return this.from <= start && end <= this.middle + 2;
		else
			return this.middle <= start && end <= this.to;

	}

	empty(): boolean {
		return this.from + 3 === this.middle && this.middle + 2 === this.to - 3;
	}

	part_is_empty(left: boolean) {
		return left ? this.from + 3 === this.middle : this.middle + 2 === this.to - 3;
	}

	reject(str: string, offset = 0) {
		return this.unwrap(str, offset).slice(this.middle - this.from - 3);
	}

	postprocess(str: string, unwrap: boolean = true, livepreview_mode: number = 0, tag: string = "div", left: boolean | null = null) {
		let parts: string[] = [str];
		if (unwrap) {
			// Node is larger than what is actually given (no end bracket found within text)
			if (this.to >= str.length && !str.endsWith(CM_All_Brackets[NodeType.SUBSTITUTION][2]))
				parts = this.unwrap_parts_bracket(str, true);
			else if (this.from <= 0 && !str.startsWith(CM_All_Brackets[NodeType.SUBSTITUTION][0]))
				parts = this.unwrap_parts_bracket(str, false);
			else
				parts = this.unwrap_parts(str);
		}

		if (parts.length === 1) {
			if (!livepreview_mode)
				str = `<${tag} class='criticmarkup-preview criticmarkup-${left ? "deletion" : "addition"}'>${parts[0]}</${tag}>`;
			else if (livepreview_mode === 1)
				str = left ? "" : `<${tag} class='criticmarkup-preview'>${parts[0]}</${tag}>`;
			else
				str = left ? `<${tag} class='criticmarkup-preview'>${parts[0]}</${tag}>` : "";
		} else {
			if (!livepreview_mode) {
				str = "";
				if (parts[0].length)
					str += `<${tag} class='criticmarkup-preview criticmarkup-deletion'>${parts[0]}</${tag}>`;
				if (parts[1].length)
					str += `<${tag} class='criticmarkup-preview criticmarkup-addition'>${parts[1]}</${tag}>`;
			}
			else if (livepreview_mode === 1)
				str = `<${tag} class='criticmarkup-preview'>${parts[1]}</${tag}>`;
			else
				str = `<${tag} class='criticmarkup-preview'>${parts[0]}</${tag}>`;
		}
		return str;
	}

}

export class HighlightNode extends CriticMarkupNode {
	constructor(from: number, to: number) {
		super(from, to, NodeType.HIGHLIGHT, 'Highlight');
	}
}

export class CommentNode extends CriticMarkupNode {
	constructor(from: number, to: number) {
		super(from, to, NodeType.COMMENT, 'Comment');
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
		let front_node: undefined | CriticMarkupNode;
		let back_node: undefined | CriticMarkupNode;


		if (!nodes)
			nodes = this.nodes_in_range(from, to, true);

		if (nodes.length === 0)
			return { output: string_in_range, from, to };

		let output = '';
		if (nodes.length === 1) {
			const node = nodes[0];
			if (from < node.from)
				output += str.slice(from, node.from);
			else
				front_node = node;
			output += node.unwrap_slice(str, from, to);
			if (to > node.to)
				output += str.slice(node.to, to);
			else
				back_node = node;
		} else {
			if (from < nodes[0].from)
				output += str.slice(from, nodes[0].from);
			else
				front_node = nodes[0];

			let prev_node = -1;
			for (const node of nodes) {
				if (prev_node !== -1)
					output += str.slice(prev_node, node.from);
				output += node.unwrap_slice(str, from, to);
				prev_node = node.to;
			}

			if (to > nodes.at(-1)!.to)
				output += str.slice(nodes.at(-1)!.to, to);
			else
				back_node = nodes.at(-1)!;

		}

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
}


export const NODE_ICON_MAPPER = {
	[NodeType.ADDITION]: 'plus-circle',
	[NodeType.DELETION]: 'minus-square',
	[NodeType.SUBSTITUTION]: 'replace',
	[NodeType.HIGHLIGHT]: 'highlighter',
	[NodeType.COMMENT]: 'message-square',
};

export const NODE_PROTOTYPE_MAPPER = {
	[NodeType.ADDITION]: AdditionNode,
	[NodeType.DELETION]: DeletionNode,
	[NodeType.HIGHLIGHT]: HighlightNode,
	[NodeType.SUBSTITUTION]: SubstitutionNode,
	[NodeType.COMMENT]: CommentNode,
};
