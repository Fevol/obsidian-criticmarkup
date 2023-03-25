import type { SelectionRange } from '@codemirror/state';
import { CM_All_Brackets } from './util';
import type {Text} from '@codemirror/state';

export interface PluginSettings {
	suggestion_status: number;

	editor_preview_button: boolean;
	editor_gutter: boolean;

	editor_styling: boolean;
	hide_empty_gutter: boolean;

	tag_completion: boolean;
	node_correcter: boolean;

	suggest_mode: boolean;
	editor_suggest_button: boolean;

	post_processor: boolean;
	live_preview: boolean;
}

export class CriticMarkupNode {
	from: number;
	middle?: number;
	to: number;
	type: string;

	constructor(from: number, to: number, type: string, middle?: number) {
		this.from = from;
		this.to = to;
		this.type = type;
		this.middle = middle;
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
		return start <= this.from && this.from <= end || start <= this.to && this.to <= end;
	}

	encloses(start: number, end: number) {
		return this.from <= start && this.to >= end;
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
		if (this.nodes.length === 0)
			return {output: str, start, to, prefix: '', suffix: '', offset: 0};


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
		let offset = 0;

		offset = -6 * this.nodes.length;

		for (const [idx, node] of this.nodes.entries()) {
			if (extended_range && (!idx || idx === this.nodes.length - 1)) {
				if (node.type !== type && new_start !== start && start - node.from > 3) {
					const text =  node.text(str, new_start);
					prefix = text.slice(0, start - node.from) + CM_All_Brackets[node.type].at(-1);
					output += text.slice(start - node.from, -3);
					offset += 6;
				} else if (node.type !== type && new_to !== to && node.to - to > 3) {
					const text =  node.text(str, new_start);
					output += text.slice(3, to - node.from);
					suffix = CM_All_Brackets[node.type].at(0) + text.slice(to - node.from);
					offset += 3;
				} else {
					// if (idx === this.nodes.length - 1 && new_to !== to && node.type !== type)
					// 	offset += 3;
					output += node.unwrap(str, new_start);
				}
			} else {
				output += node.unwrap(str, new_start);
			}

			if (idx !== this.nodes.length - 1)
				output += str.slice(node.to - new_start, this.nodes[idx + 1].from - new_start);
		}

		// if (extended_range && !suffix && this.nodes.at(-1)!.type !== type)
		// 	console.log("RIGHT NODE IS EMPTY")

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
		}
	}
}


export interface CriticMarkupRange {
	from: number;
	to: number;
	offset: {
		removed: number,
		added: number,
	};
	inserted: string;
	deleted: string | undefined;
}

export interface EditorChange {
	from: number;
	to: number;
	insert: string;
}

export interface OperationReturn {
	changes: EditorChange[];
	selection: SelectionRange;
	offset: number;
}
