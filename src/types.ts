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
			return {output: str, start, to, left_bracket: false, right_bracket: false};

		let output = '';
		if (start <= this.nodes[0].from)
			output += str.slice(0, this.nodes[0].from - start);

		let extended_selection = false;
		if (this.nodes[0].from <= start && this.nodes[0].from + 3 >= start) {
			start = this.nodes[0].from;
			extended_selection = true;
		}

		if (this.nodes.at(-1)!.to - 3 <= to && this.nodes.at(-1)!.to >= to) {
			to = this.nodes[this.nodes.length - 1].to;
			extended_selection = true;
		}

		if (extended_selection)
			str = doc.sliceString(start, to);

		let new_start = start;
		let new_to = to;
		let prefix = '';
		let suffix = '';
		let left_bracket = false;
		let right_bracket = false;

		for (const [idx, node] of this.nodes.entries()) {
			if (!idx || idx === this.nodes.length - 1) {
				let partial = false;
				let content = node.text(str, start);
				if (node.from < to && node.to > to) {
					if (node.from + 3 < to) {
						partial = true;
						content = content.slice(3)
						if (node.type !== type)
							 suffix = CM_All_Brackets[node.type].at(0)!;
						else
							right_bracket = true;
					} else {
						new_start = node.from;
					}
				}

				if (node.from < start && node.to < to) {
					if (node.to - 3 > start) {
						partial = true;
						content = content.slice(0, -3);
						if (node.type !== type)
							prefix = CM_All_Brackets[node.type].at(-1)!;
						else
							left_bracket = true;
					} else {
						new_to = node.to;
					}
				}

				output += partial ? content : node.unwrap(str, start);
			} else {
				output += node.unwrap(str, start);
			}

			if (idx < this.nodes.length - 1)
				output += str.slice(node.to - start, this.nodes[idx + 1].from - start);
		}

		if (this.nodes[this.nodes.length - 1].to <= to)
			output += str.slice(this.nodes[this.nodes.length - 1].to - start);

		return { output, start: new_start, to: new_to, left_bracket, right_bracket, prefix, suffix };
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
