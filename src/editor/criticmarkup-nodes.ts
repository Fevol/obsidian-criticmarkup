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

	encloses(start: number, end: number) {
		return this.from <= start && this.to >= end;
	}

	accept(str: string, offset = 0) {
		return this.text(str, offset);
	}

	reject(str: string, offset = 0) {
		return this.text(str, offset);
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

	at_cursor(cursor: number) {
		return this.nodes.find(node => node.from <= cursor && node.to >= cursor);
	}

	adjacent_to_cursor(cursor: number, left: boolean) {
		if (left)
			return this.nodes.slice().reverse().find(node => node.to <= cursor);
		return this.nodes.find(node => node.from >= cursor);
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
		console.log(this.nodes);
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

