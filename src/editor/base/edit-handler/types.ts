import { SelectionRange } from '@codemirror/state';
import {CriticMarkupRange, METADATA_TYPE} from "../ranges";

export interface EditorRange {
	from: number;
	to: number;
	head?: number;
	anchor?: number;
	selection?: boolean;
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

export interface EditorSuggestion extends EditorChange {
	start: number;
	end: number;
}

export interface OperationReturn {
	changes?: EditorChange[];
	selection?: SelectionRange;
	offset?: number;
	debug?: { range?: CriticMarkupRange, metadata_type?: METADATA_TYPE };
}
