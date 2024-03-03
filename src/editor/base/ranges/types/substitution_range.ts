import {CM_All_Brackets, SuggestionType} from '../definitions';
import { CriticMarkupRange } from '../base_range';

export class SubstitutionRange extends CriticMarkupRange {
	constructor(from: number, public middle: number, to: number, text: string, metadata?: number) {
		super(from, to, SuggestionType.SUBSTITUTION, 'Substitution', text, metadata);
	}

	get length() {
		return this.to - this.from - 8;
	}

	get char_middle() {
		return this.middle - this.range_front;
	}

	range_type(from: number, to: number) {
		return to <= this.middle + 2 ? SuggestionType.DELETION :
			   from >= this.middle ? SuggestionType.ADDITION :
				   					SuggestionType.SUBSTITUTION;
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

	unwrap_slice_parts_inverted(from: number, to: number) {
		from -= this.range_front;
		to -= this.range_front;

		from = Math.max(0, from);

		if (to <= 0) return this.unwrap_parts();
		if (to <= this.char_middle)
			return [
				this.text.slice(3, from) + this.text.slice(to, this.char_middle),
				this.text.slice(this.char_middle + 2, -3),
			];
		if (from >= this.char_middle + 2)
			return [
				this.text.slice(3, this.char_middle),
				this.text.slice(this.char_middle + 2, from) + this.text.slice(to, -3),
			];
		return [
			this.text.slice(3, from),
			this.text.slice(to, -3),
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
		from -= this.range_front;
		to -= this.range_front;
		if (to <= 0 || from === to) return '';

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
		return cursor + (left_loose ? 1 : 0) >= this.middle && cursor - (right_loose ? 0 : 1) <= this.middle + 2;
	}

	contains_separator(from: number, to: number) {
		return from <= this.middle + 2 && to >= this.middle;
	}

	cursor_pass_syntax(cursor: number, right: boolean, skip_metadata: boolean = false): number {
		if (right) {
			if (this.touches_left_bracket(cursor, true, false, skip_metadata))
				cursor = (skip_metadata && this.metadata) ? (this.metadata! + 2) : (this.from + 3);
			if (this.touches_separator(cursor, false, true))
				cursor = this.middle + 2;
			if (this.touches_right_bracket(cursor, false, true))
				cursor = this.to;
		} else {
			if (this.touches_right_bracket(cursor, true, false))
				cursor = this.to - 3;
			if (this.touches_separator(cursor, false, true))
				cursor = this.middle;
			if (this.touches_left_bracket(cursor, false, true, skip_metadata))
				cursor = this.from;
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
			// Range is larger than what is actually given (no end bracket found within text)
			if (this.to >= str.length && !str.endsWith(CM_All_Brackets[SuggestionType.SUBSTITUTION][2]))
				parts = this.unwrap_parts_bracket(true);
			else if (this.from <= 0 && !str.startsWith(CM_All_Brackets[SuggestionType.SUBSTITUTION][0]))
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

	apply_offset(offset: number) {
		super.apply_offset(offset);
		this.middle += offset;
		return this;
	}

	split_range(cursor: number): [string, string] {
		const range = super.split_range(cursor);
		if (cursor <= this.middle)
			range[0] = CM_All_Brackets.substitution[1] + range[0];
		else
			range[1] = range[1] + CM_All_Brackets.substitution[1];
		return range;
	}

	cursor_move_inside(cursor: number, skip_metadata = false) {
		cursor = super.cursor_move_inside(cursor, skip_metadata);
		if (cursor == this.middle + 1)
			cursor = this.middle + 2;
		return cursor;
	}
}
