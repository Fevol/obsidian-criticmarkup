import { SelectionRange } from '@codemirror/state';
import {CriticMarkupRange, METADATA_TYPE, RangeType, SuggestionType} from "../ranges";

export interface EditorRange {
	from: number;
	to: number;
	head?: number;
	anchor?: number;
}

export interface EditorOffsetChange extends EditorRange {
	offset: {
		removed: number,
		added: number,
	}
}

export interface EditorEditChange extends EditorOffsetChange {
	inserted: string;
	deleted: string | undefined;
}

export interface EditorChange {
	from: number;
	to: number;
	insert: string;
}

export interface OperationReturn {
	changes?: EditorChange[];
	selection?: SelectionRange;
	offset?: number;
	debug?: { range?: CriticMarkupRange, metadata_type?: METADATA_TYPE };
}
