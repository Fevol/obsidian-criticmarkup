import { SelectionRange } from '@codemirror/state';

export interface CriticMarkupRange {
	from: number;
	to: number;
	head?: number;
	anchor?: number;
}

export interface CriticMarkupOperation extends CriticMarkupRange {
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
