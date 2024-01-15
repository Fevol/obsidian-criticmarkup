import {ChangeSet} from '@codemirror/state';
import {CM_All_Brackets, RANGE_CURSOR_MOVEMENT_OPTION, type StringSuggestionType, type SuggestionType} from './definitions';
import type {EditorChange} from '../edit-operations';
import {type CommentRange} from './types';


const shortHandMapping = {
	'a': 'author',
	't': 'time',
	'd': 'done',
	's': 'style',
	'c': 'color',
};


export interface MetadataFields {
	author?: string;
	time?: number;
	done?: boolean;
	style?: string;
	color?: string;
}

export abstract class CriticMarkupRange {
	num_ignore_chars = 6;

	fields: MetadataFields = {};
	replies: CommentRange[] = [];

	protected constructor(public from: number, public to: number, public type: SuggestionType, public repr: StringSuggestionType, public text: string, public metadata?: number) {
		if (metadata !== undefined) {
			const metadata_separator = metadata - from;
			const metadata_text = text.slice(3, metadata_separator);
			this.text = text.slice(0, 3) + text.slice(metadata_separator + 2);
			try {
				// TODO: Determine whether metadata specification should have quotes around keywords
				//   + Cleaner, shorter
				//   - Not valid JSON
				// TODO: JS can be injected here, possible security risk
				this.fields = JSON.parse(`{${metadata_text}}`);
				for (const key in this.fields) {
					if (key in shortHandMapping) {
						// @ts-ignore (This is a pain to type, the ts-ignore is 100% worth it)
						this.fields[shortHandMapping[key]] = this.fields[key];
						delete this.fields[key as keyof typeof this.fields];
					}
				}
			} catch (e) {
				// TODO: Mark as invalid markdown (this can happen when separator @@ exists, but {} is not given
				this.fields = {};
			}
		}
	}

	get base_range(): CriticMarkupRange {
		return this;
	}

	get length() {
		return this.to - this.from - 6;
	}

	get full_text() {
		return this.text + this.replies.map(reply => reply.text).join('');
	}

	remove_metadata(): EditorChange[] {
		if (!this.metadata) return [];
		return [{
			from: this.from + 3,
			to: this.metadata + 2,
			insert: '',
		}];
	}

	delete_metadata(key: string): EditorChange[] {
		if (key in shortHandMapping) key = shortHandMapping[key as keyof typeof shortHandMapping];

		if (key in this.fields) {
			delete this.fields[key as keyof typeof this.fields];
			if (Object.keys(this.fields).length === 0) {
				this.remove_metadata();
			} else {
				this.set_metadata(this.fields);
			}
		}
		return [];
	}

	add_metadata(key: string, value: any): EditorChange[] {
		this.fields[key as keyof typeof this.fields] = value;
		return this.set_metadata(this.fields);
	}

	set_metadata(fields: MetadataFields): EditorChange[] {
		// TODO: Possibly redundant assignment, ranges will automatically get re-constructed with the EditorChange
		this.fields = fields;
		if (this.metadata !== undefined) {
			return [{
				from: this.from + 3,
				to: this.metadata,
				insert: JSON.stringify(fields).slice(1, -1),
			}];
		} else {
			return [{
				from: this.from + 3,
				to: this.from + 3,
				insert: `${JSON.stringify(fields)}`.slice(1, -1) + '@@',
			}];
		}
	}

	copy(): CriticMarkupRange {
		return Object.assign(Object.create(Object.getPrototypeOf(this)), this);
	}

	weak_equals(other: CriticMarkupRange) {
		return this.type === other.type && this.from === other.from && this.to === other.to && this.text === other.text;
	}

	equals(other: CriticMarkupRange) {
		return this.type === other.type && this.from === other.from && this.to === other.to && this.full_text === other.full_text;
	}

	left_adjacent(other: CriticMarkupRange) {
		return this.from === other.to;
	}

	right_adjacent(other: CriticMarkupRange) {
		return this.to === other.from;
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

	range_infront(start: number, end: number) {
		return this.to < start;
	}

	range_behind(start: number, end: number) {
		return end < this.from;
	}

	cursor_inside(cursor: number) {
		return this.from <= cursor && cursor <= this.to;
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

	cursor_before_range(cursor: number) {
		return cursor < this.from;
	}

	cursor_after_range(cursor: number) {
		return cursor > this.to;
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

	cursor_pass_syntax(cursor: number, right: boolean, movement: RANGE_CURSOR_MOVEMENT_OPTION) {
		if (movement == RANGE_CURSOR_MOVEMENT_OPTION.UNCHANGED || !this.cursor_inside(cursor)) { /* No action */ }
		else if (movement == RANGE_CURSOR_MOVEMENT_OPTION.IGNORE_COMPLETELY)
			cursor = right ? this.to : this.from;
		else {
			if (right) {
				if (this.touches_left_bracket(cursor, true, false, movement == RANGE_CURSOR_MOVEMENT_OPTION.IGNORE_METADATA))
					cursor = (movement === RANGE_CURSOR_MOVEMENT_OPTION.IGNORE_METADATA && this.metadata) ? this.metadata + 2 : this.from + 3;
				if (this.touches_right_bracket(cursor, false, true))
					cursor = this.to;
			} else {
				if (this.touches_right_bracket(cursor, true, false))
					cursor = this.to - 3;
				if (this.touches_left_bracket(cursor, false, true, movement == RANGE_CURSOR_MOVEMENT_OPTION.IGNORE_METADATA))
					cursor = this.from;
			}
		}
		return cursor;
	}


	touches_left_bracket(cursor: number, outside_loose = false, inside_loose = false, include_metadata = false) {
		return cursor + (outside_loose ? 0 : 1) >= this.from &&
			   cursor + (inside_loose ? 0 : 1) <= ((include_metadata && this.metadata) ? this.metadata + 2 : this.from + 3);
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

	postprocess(unwrap: boolean = true, livepreview_mode: number = 0, tag: string = 'div', left: boolean | null = null, text?: string) {
		let str = text ?? this.text;
		if (!text && unwrap) {
			// Range is larger than what is actually given (no end bracket found within text)
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

	/**
	 * Returns whether the character at the given cursor position is a syntax character
	 * @param cursor
	 */
	is_syntax_char(cursor: number) {
		return (this.from <= cursor && cursor <= this.from + 3) ||
			   (this.to - 3 <= cursor && cursor <= this.to) ||
			   (this.metadata !== undefined && this.metadata <= cursor && cursor <= this.metadata + 2);
	}
}
