import { ChangeSet, Text } from '@codemirror/state';
import { type StringNodeType, NodeType } from '../types';
import { CM_All_Brackets } from '../util';

export abstract class CriticMarkupNode {
	num_ignore_chars = 6;
	constructor(public from: number, public to: number, public type: NodeType, public repr: StringNodeType, public text: string) {

	}

	copy(): CriticMarkupNode {
		return Object.assign(Object.create(Object.getPrototypeOf(this)), this);
	}

	equals(other: CriticMarkupNode) {
		return this.type === other.type && this.text === other.text;
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
		return 6 === this.to - this.from;
	}

	unwrap() {
		return this.text.slice(3, -3);
	}

	unwrap_bracket(left = false) {
		return left ? this.text.slice(3) : this.text.slice(0, -3);
	}

	unwrap_parts(): string[] {
		return [this.unwrap()];
	}

	unwrap_slice(from: number, to: number) {
		return this.text.slice(Math.max(3, from), Math.min(this.text.length - 3, to));
	}

	fully_in_range(start: number, end: number, strict = false) {
		if (strict)
			return start <= this.from + 3 && this.to - 3 <= end;
		return start <= this.from && this.to <= end;
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

	accept() {
		return this.text;
	}

	reject() {
		return this.text;
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

	range_infront(start: number, end: number) {
		return this.to < start;
	}

	range_behind(start: number, end: number) {
		return end < this.from
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


	postprocess(unwrap: boolean = true, livepreview_mode: number = 0, tag: string = "div", left: boolean | null = null, text?: string) {
		let str = text ?? this.text;
		if (!text && unwrap) {
			// Node is larger than what is actually given (no end bracket found within text)
			if (this.to >= str.length && !str.endsWith(CM_All_Brackets[this.type].at(-1)!))
				str = this.unwrap_bracket(true);
			/*else if (this.from === 0 && !str.startsWith(CM_All_Brackets[this.type][0]))
				str = this.unwrap_bracket(str, false);*/
			else
				str = this.unwrap();
		}

		return `<${tag} class='criticmarkup-${this.repr.toLowerCase()}'>${str}</${tag}>`;
	}

	apply_change(changes: ChangeSet) {
		this.from = changes.mapPos(this.from, 1);
		this.to = changes.mapPos(this.to, 1);
	}

	apply_offset(offset: number) {
		this.from += offset;
		this.to += offset;
	}


	get length() {
		return this.to - this.from - 6;
	}
}

export class AdditionNode extends CriticMarkupNode {
	constructor(from: number, to: number, text: string) {
		super(from, to, NodeType.ADDITION, 'Addition', text);
	}

	accept() {
		return this.unwrap();
	}

	reject() {
		return '';
	}

	postprocess(unwrap: boolean = true, livepreview_mode: number = 0, tag: string = "div", left: boolean | null = null, text?: string) {
		let str = text ?? this.text;
		if (!text && unwrap) {
			// Node is larger than what is actually given (no end bracket found within text)
			if (this.to >= str.length && !str.endsWith(CM_All_Brackets[this.type].at(-1)!))
				str = this.unwrap_bracket(true);
			/*else if (this.from === 0 && !str.startsWith(CM_All_Brackets[this.type][0]))
				str = this.unwrap_bracket(str, false);*/
			else
				str = this.unwrap();
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
	constructor(from: number, to: number, text: string) {
		super(from, to, NodeType.DELETION, 'Deletion', text);
	}

	accept() {
		return '';
	}

	reject() {
		return this.unwrap();
	}

	postprocess(unwrap: boolean = true, livepreview_mode: number = 0, tag: string = "div", left: boolean | null = null, text?: string) {
		let str = text ?? this.text;
		if (!text && unwrap) {
			// Node is larger than what is actually given (no end bracket found within text)
			if (this.to >= str.length && !str.endsWith(CM_All_Brackets[this.type].at(-1)!))
				str = this.unwrap_bracket(true);
			/*else if (this.from === 0 && !str.startsWith(CM_All_Brackets[this.type][0]))
				str = this.unwrap_bracket(str, false);*/
			else
				str = this.unwrap();
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
	num_ignore_chars = 8;

	constructor(from: number, public middle: number, to: number, text: string) {
		super(from, to, NodeType.SUBSTITUTION, 'Substitution', text);
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

	unwrap() {
		return this.text.slice(3, this.char_middle) + this.text.slice(this.char_middle + 2, -3);
	}

	unwrap_parts() {
		return [
			this.text.slice(3, this.char_middle),
			this.text.slice(this.char_middle + 2, -3),
		];
	}

	unwrap_parts_bracket(left: boolean, offset = 0) {
		if (left) {
			return [
				this.text.slice(3, this.char_middle),
				this.text.slice(this.char_middle + 2),
			]
		} else {
			return [
				this.text.slice(0, this.char_middle),
				this.text.slice(this.char_middle + 2, -3),
			]
		}
	}

	unwrap_slice(from: number, to: number) {
		if (from >= this.char_middle)
			return this.text.slice(Math.max(this.char_middle + 2, from), Math.min(this.text.length - 3, to));
		if (to <= this.char_middle)
			return this.text.slice(Math.max(3, from), Math.min(this.char_middle, to));
		return this.text.slice(Math.max(3, from), this.char_middle) +
			   this.text.slice(this.char_middle + 2, Math.min(this.text.length - 3, to));
	}


	accept() {
		return this.unwrap_parts()[1];
	}

	reject() {
		return this.unwrap_parts()[0];
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

	postprocess(unwrap: boolean = true, livepreview_mode: number = 0, tag: string = "div", left: boolean | null = null, text?: string) {
		let str = text ?? this.text;
		let parts: string[] = [str];
		if (!text && unwrap) {
			// Node is larger than what is actually given (no end bracket found within text)
			if (this.to >= str.length && !str.endsWith(CM_All_Brackets[NodeType.SUBSTITUTION][2]))
				parts = this.unwrap_parts_bracket(true);
			else if (this.from <= 0 && !str.startsWith(CM_All_Brackets[NodeType.SUBSTITUTION][0]))
				parts = this.unwrap_parts_bracket(false);
			else
				parts = this.unwrap_parts();
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

	apply_change(changes: ChangeSet): void {
		super.apply_change(changes);
		this.to = changes.mapPos(this.to, 1);
	}

	apply_offset(offset: number) {
		super.apply_offset(offset);
		this.middle += offset;
	}

	get length() {
		return this.to - this.from - 8;
	}

	get char_middle() {
		return this.middle - this.from;
	}
}

export class HighlightNode extends CriticMarkupNode {
	constructor(from: number, to: number, text: string) {
		super(from, to, NodeType.HIGHLIGHT, 'Highlight', text);
	}
}

export class CommentNode extends CriticMarkupNode {
	constructor(from: number, to: number, text: string) {
		super(from, to, NodeType.COMMENT, 'Comment', text);
	}
}


export function constructNode(from: number, to: number, type: string, text: string, middle?: number) {
	switch (type) {
		case 'Addition':
			return new AdditionNode(from, to, text);
		case 'Deletion':
			return new DeletionNode(from, to, text);
		case 'Substitution':
			return new SubstitutionNode(from, middle!, to, text);
		case 'Highlight':
			return new HighlightNode(from, to, text);
		case 'Comment':
			return new CommentNode(from, to, text);
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
