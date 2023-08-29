import type { SelectionRange } from '@codemirror/state';
import type { Command } from 'obsidian';


export type StringNodeType = 'Addition' | 'Deletion' | 'Substitution' | 'Highlight' | 'Comment';

export enum NodeType {
	ADDITION,
	DELETION,
	SUBSTITUTION,
	HIGHLIGHT,
	COMMENT,
}


export interface PluginSettings {
	/**
	 * Determines how nodes should be visualised in LP/S mode
	 * - 0: Show all text
	 * - 1: Visualise 'accept' action (only show regular text and Addition Nodes)
	 * - 2: Visualise 'reject' action (only show regular text and Deletion Nodes)
	 */
	preview_mode: number;
	/**
	 * Add a toggle button for quickly toggling between preview modes
	 */
	editor_preview_button: boolean;

	/**
	 * Render a gutter marking locations of nodes in the document
	 */
	editor_gutter: boolean;
	/**
	 * Keep styling nodes even if cursor is inside it
	 */
	editor_styling: boolean;
	/**
	 * Hide gutter is no nodes are present (such that editor body is flush with the title)
	 */
	hide_empty_gutter: boolean;
	/**
	 * How comments should be rendered
	 */
	comment_style: 'inline' | 'icon' | 'block';

	/**
	 * Complete criticmarkup tags when they're being entered in
	 */
	tag_completion: boolean;
	/**
	 * Automatically correct invalid criticmarkup tags
	 */
	node_correcter: boolean;
	/**
	 * Remove CM syntax when copying text to clipboard
	 */
	clipboard_remove_syntax: boolean;

	/**
	 * Enable editor suggestion mode
	 */
	suggest_mode: boolean;
	/**
	 * Add a toggle button for quickly toggling suggestion mode on/off
	 */
	editor_suggest_button: boolean;

	/**
	 * Enable post processor rendering
	 */
	post_processor: boolean;
	/**
	 * Enable live preview rendering
	 */
	live_preview: boolean;
	/** Enable alternative live preview renderer */
	alternative_live_preview: boolean;

	/**
	 * Enable corrected cursor movement near/within nodes
	 */
	alternative_cursor_movement: boolean;
}



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

/**
 * Simple interface to automatically convert regular callback commands to editor callbacks on mobile
 */
export interface ECommand extends Command {
	/**
	 * Whether the callback will be set to editorCallback or regular callback
	 * @remark Will be overridden to always be true if mobile
	 */
	editor_context?: boolean;

	/**
	 * Command with regular callback, if mobile, command will be set to editorCallback by default to add the command to the mobile toolbar
	 */
	regular_callback?: (...args: any[]) => any;

	/**
	 * Command with checking callback, if mobile, command will be set to editorCheckCallback by default to add the command to the mobile toolbar
	 */
	check_callback?: (checking: boolean, ...args: any[]) => any;
}
