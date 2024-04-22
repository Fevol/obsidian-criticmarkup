import {CM_All_Brackets, type STRING_SUGGESTION_TYPE, type SuggestionType} from './definitions';
import type {EditorChange} from '../edit-handler';
import {type CommentRange} from './types';
import {PreviewMode, RANGE_CURSOR_MOVEMENT_OPTION} from "../../../types";


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
	[prop: string]: any;
}

export abstract class CriticMarkupRange {
	fields: MetadataFields = {};
	replies: CommentRange[] = [];

	protected constructor(public from: number, public to: number, public type: SuggestionType, public repr: STRING_SUGGESTION_TYPE, public text: string, public metadata?: number) {
		if (metadata !== undefined) {
			const metadata_separator = metadata - from;
			const metadata_text = text.slice(3, metadata_separator);
			this.text = text.slice(0, 3) + text.slice(metadata_separator + 2);
			try {
				// TODO: Determine whether metadata specification should have quotes around keywords
				//   + Cleaner, shorter
				//   - Not valid JSON
				// TODO: JS can be injected here, possible security risk
				// this.fields = JSON.parse(`{${metadata_text}}`);
				this.fields = JSON.parse(metadata_text);
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

	get thread(): CommentRange[] {
		return [...this.replies];
	}

	get length() {
		return this.to - this.from - 6;
	}

	get full_text() {
		return this.text + this.replies.map(reply => reply.text).join('');
	}

	get range_start() {
		return this.metadata ? this.metadata + 2 : this.from + 3;
	}

	get range_front() {
		return this.metadata ? this.metadata - 1 : this.from;
	}

	get full_range_back(): number {
		return this.base_range.replies.length ? this.base_range.replies[this.base_range.replies.length - 1].to : this.to;
	}

	range_type(from: number, to: number): SuggestionType {
		return this.type;
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
				insert: JSON.stringify(fields),
			}];
		} else {
			return [{
				from: this.from + 3,
				to: this.from + 3,
				insert: JSON.stringify(fields) + '@@',
			}];
		}
	}

	has_comment(comment: CommentRange): boolean {
		return this.thread.includes(comment);
	}

	copy(): CriticMarkupRange {
		return Object.assign(Object.create(Object.getPrototypeOf(this)), this);
	}

	equals(other: CriticMarkupRange) {
		return this.type === other.type && this.from === other.from && this.to === other.to && this.replies.length === other.replies.length && this.full_text === other.full_text;
	}

	left_adjacent(other: CriticMarkupRange) {
		return this.from === other.to;
	}

	right_adjacent(other: CriticMarkupRange) {
		return this.to === other.from;
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
		from -= this.range_front;
		to -= this.range_front;
		if (to <= 0 || from === to) return '';

		return this.text.slice(Math.max(3, from), Math.min(this.text.length - 3, to));
	}

	partially_in_range(start: number, end: number) {
		// return this.from < end && start < this.to;
		return !(start > this.to || end < this.from);
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

	cursor_inside(cursor: number) {
		return this.from <= cursor && cursor <= this.to;
	}

	cursor_before_range(cursor: number) {
		return cursor < this.from;
	}

	cursor_after_range(cursor: number) {
		return cursor > this.to;
	}

	/**
	 * Moves a cursor inside the first non-syntax/metadata if it is either outside the range, or inside syntax
	 * @param cursor Cursor to move
	 * @param skip_metadata Whether to skip metadata
	 * @remark Cursor will jump to range regardless whether it is adjacent to the range or not
	 */
	cursor_move_inside(cursor: number, skip_metadata = false) {
		return Math.min(Math.max((skip_metadata && this.metadata) ? this.metadata + 2 : this.from + 3, cursor), this.to - 3);
	}

	cursor_pass_syntax(cursor: number, right: boolean, skip_metadata: boolean = false) {
		if (right) {
			if (this.touches_left_bracket(cursor, true, false, skip_metadata)) {
				cursor = (skip_metadata && this.metadata) ? (this.metadata! + 2) : (this.from + 3);
			} if (this.touches_right_bracket(cursor, false, true))
				cursor = this.to;
		} else {
			if (this.touches_right_bracket(cursor, true, false))
				cursor = this.to - 3;
			if (this.touches_left_bracket(cursor, false, true, skip_metadata))
				cursor = this.from;
		}
		return cursor;
	}

	cursor_move_through(cursor: number, right: boolean, movement: RANGE_CURSOR_MOVEMENT_OPTION) {
		if (movement == RANGE_CURSOR_MOVEMENT_OPTION.UNCHANGED || !this.cursor_inside(cursor)) { /* No action */ }
		else if (movement == RANGE_CURSOR_MOVEMENT_OPTION.IGNORE_COMPLETELY)
			cursor = right ? this.to : this.from;
		else
			cursor = this.cursor_pass_syntax(cursor, right, movement == RANGE_CURSOR_MOVEMENT_OPTION.IGNORE_METADATA);
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

	postprocess(unwrap: boolean = true, previewMode: PreviewMode = PreviewMode.ALL, tag: keyof HTMLElementTagNameMap = 'div', left: boolean | null = null, text?: string): string | HTMLElement {
		let str = text ?? this.text;
		if (!text && unwrap) {
			if (this.to >= str.length && !str.endsWith(CM_All_Brackets[this.type].at(-1)!))
				str = this.unwrap_bracket(true);
			else
				str = this.unwrap();
		}
		return `<${tag} class='criticmarkup-${this.repr.toLowerCase()}'>${str}</${tag}>`;
	}

	apply_offset(offset: number) {
		this.from += offset;
		this.to += offset;
		if (this.metadata !== undefined) this.metadata += offset;
	}

	/**
	 * Get the required characters to fix a range when splitting a range at given cursor position
	 * @param cursor Cursor position to split at
	 */
	split_range(cursor: number): [string, string] {
		return [this.text.slice(-3), this.text.slice(0, 3) + (this.metadata ? JSON.stringify(this.fields) + '@@' : '')];
	}
}
