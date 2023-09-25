import { ChangeSet } from '@codemirror/state';
import { type NodeType, type StringNodeType, CM_All_Brackets } from './definitions';

export abstract class CriticMarkupNode {
	num_ignore_chars = 6;

	author: string | null = null;
	time: number | null = null;
	done: boolean | null = null;
	style: string | null = null;
	color: string | null = null;

	protected constructor(public from: number, public to: number, public type: NodeType, public repr: StringNodeType, public text: string, public metadata?: number) {
		if (metadata !== undefined) {
			const metadata_separator = metadata - from;
			const metadata_text = text.slice(3, metadata_separator);
			this.text = text.slice(0, 3) + text.slice(metadata_separator + 2);
			try {
				// TODO: Determine whether metadata specification should have quotes around keywords
				//   + Cleaner, shorter
				//   - Not valid JSON
				// TODO: JS can be injected here, possible security risk
				const fields = (0, eval)(`({${metadata_text}})`);
				this.author = fields.author ?? fields.a;
				this.time = fields.time ?? fields.t;
				this.done = fields.done ?? fields.d;
				this.style = fields.style ?? fields.s;
				this.color = fields.color ?? fields.c;
			} catch (e) {}
		}
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
		return this;
	}


	get length() {
		return this.to - this.from - 6;
	}
}
