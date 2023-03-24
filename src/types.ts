import type { SelectionRange } from '@codemirror/state';

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

export interface CriticMarkupNode {
	from: number,
	middle?: number,
	to: number,
	type: string
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
