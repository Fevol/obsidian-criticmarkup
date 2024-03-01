import type { Command } from 'obsidian';
import {SuggestionType} from "./editor/base";

export enum PreviewMode {
	ALL = 0,
	ACCEPT = 1,
	REJECT = 2,
}

export enum SuggestMode {
	OFF = 0,
	SUGGEST = 1,
}

/**
 * How to move through a suggestion range when moving the cursor
 */
export enum RANGE_CURSOR_MOVEMENT_OPTION {
	// Treat all characters as normal
	UNCHANGED = "unchanged",

	// Ignores all bracket characters, but NOT metadata
	IGNORE_BRACKET = "ignore_bracket",

	// Ignores all bracket characters AND metadata
	IGNORE_METADATA = "ignore_metadata",

	// Ignores the entire suggestion range
	IGNORE_COMPLETELY = "ignore_completely",
}

/**
 * How to move through a range when moving through a bracket
 */
export enum RANGE_BRACKET_MOVEMENT_OPTION {
	// Move as normal (move through a bracket)
	UNCHANGED = "unchanged",

	// When *leaving* a bracket, stay inside the range if cursor cannot move anymore
	STAY_INSIDE = "stay_inside",

	// When *reaching* a bracket, stay outside, even if cursor can move further
	STAY_OUTSIDE = "stay_outside",
}


export type CursorOptionsMap = Record<SuggestionType, RANGE_CURSOR_MOVEMENT_OPTION>

export type BracketOptionsMap = Record<SuggestionType, RANGE_BRACKET_MOVEMENT_OPTION>

export interface PluginSettings {
	/**
	 * Determines how ranges should be visualised in LP/S mode
	 * - 0: Show all text
	 * - 1: Visualise 'accept' action (only show regular text and Addition Ranges)
	 * - 2: Visualise 'reject' action (only show regular text and Deletion Ranges)
	 */
	preview_mode: PreviewMode;
	/**
	 * Enable editor suggestion mode
	 */
	suggest_mode: SuggestMode;

	/**
	 * Render a gutter marking locations of ranges in the document
	 */
	editor_gutter: boolean;
	/**
	 * Keep styling ranges even if cursor is inside it
	 */
	editor_styling: boolean;
	/**
	 * Hide gutter is no ranges are present (such that editor body is flush with the title)
	 */
	hide_empty_gutter: boolean;

	/**
	 * Hide suggestion gutter if no suggestions are present in the note
	 */
	hide_empty_suggestion_gutter: boolean;
	/**
	 * Hide comment gutter if no comments are present in the note
	 */
	hide_empty_comment_gutter: boolean;


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
	tag_correcter: boolean;
	/**
	 * Remove CM syntax when copying text to clipboard
	 */
	clipboard_remove_syntax: boolean;
	/**
	 * Give a warning when a transaction is being filtered out due to editing logic
	 */
	edit_info: boolean;

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
	/** Add a button for quickly toggling metadata in the status bar */
	status_bar_metadata_button: boolean;

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
	 * Enable corrected cursor movement near/within ranges
	 */
	alternative_cursor_movement: boolean;
	/**
	 * Enable corrected edits in regular mode
	 * @remark Prevent breaking up brackets, allows deletion within additions, etc.
	 */
	edit_ranges: boolean;


	/**
	 * Whether metadata extensions should be enabled
	 */
	enable_metadata: boolean;
	/**
	 * Whether authorship metadata should be enabled
	 */
	enable_author_metadata: boolean;
	/**
	 * Whether timestamps metadata should be enabled
	 */
	enable_timestamp_metadata: boolean
	/**
	 * Whether completed metadata should be enabled
	 */
	enable_completed_metadata: boolean;
	/**
	 * Whether style metadata should be enabled
	 */
	enable_style_metadata: boolean;
	/**
	 * Whether color metadata should be enabled
	 */
	enable_color_metadata: boolean;

	/**
	 * Whether metadata should be added to new ranges
	 */
	add_metadata: boolean;
	/**
	 * Whether authorship metadata should be added to new ranges
	 */
	add_author_metadata: boolean;
	/**
	 * Whether timestamps metadata should be added to new ranges
	 */
	add_timestamp_metadata: boolean
	/**
	 * Whether completed metadata should be added to new ranges
	 */
	add_completed_metadata: boolean;
	/**
	 * Whether style metadata should be added to new ranges
	 */
	add_style_metadata: boolean;
	/**
	 * Whether color metadata should be added to new ranges
	 */
	add_color_metadata: boolean;

	/**
	 * Include authorship metadata
	 */
	author?: string;


	/**
	 * Cursor movement options for ranges when in suggestion mode
	 */
	suggestion_mode_operations: {
		/**
		 * Options for cursor movement within a suggestion range
		 */
		cursor_movement: CursorOptionsMap;
		/**
		 *  Options for cursor movement between two suggestion ranges
		 */
		bracket_movement: BracketOptionsMap;
	},
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
