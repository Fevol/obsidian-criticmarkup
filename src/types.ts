import type { Command } from 'obsidian';

export enum PreviewMode {
	ALL = 0,
	ACCEPT = 1,
	REJECT = 2,
}

export interface PluginSettings {
	/**
	 * Determines how nodes should be visualised in LP/S mode
	 * - 0: Show all text
	 * - 1: Visualise 'accept' action (only show regular text and Addition Nodes)
	 * - 2: Visualise 'reject' action (only show regular text and Deletion Nodes)
	 */
	preview_mode: PreviewMode;
	/**
	 * Enable editor suggestion mode
	 */
	suggest_mode: boolean;

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
	 * How much space the comment gutter should take up
	 */
	comment_gutter_width: number;

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
	 * Add a toggle button for quickly toggling between preview modes in the editor toolbar
	 */
	editor_preview_button: boolean;
	/**
	 * Add a toggle button for quickly toggling suggestion mode on/off in the editor toolbar
	 */
	editor_suggest_button: boolean;
	/**
	 * Show the labels on the buttons found in the header
	 */
	show_editor_buttons_labels: boolean;

	/**
	 * Add a button for quickly toggling preview mode in the status bar
	 */
	status_bar_preview_button: boolean;
	/**
	 * Add a button for quickly toggling suggestion mode in the status bar
	 */
	status_bar_suggest_button: boolean;


	/**
	 * Number of workers that are available for database indexing
	 */
	database_workers: number;

	/**
	 * Enable post processor rendering
	 */
	post_processor: boolean;
	/**
	 * Enable live preview rendering
	 */
	live_preview: boolean;

	/**
	 * Enable corrected cursor movement near/within nodes
	 */
	alternative_cursor_movement: boolean;
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
