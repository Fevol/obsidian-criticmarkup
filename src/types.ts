import type { Command } from "obsidian";
import { SuggestionType } from "./editor/base";

export enum PreviewMode {
	// Show all text
	ALL = 0,
	// Visualise 'accept' action (only show regular text and Addition Ranges)
	ACCEPT = 1,
	// Visualise 'reject' action (only show regular text and Deletion Ranges)
	REJECT = 2,
}

export enum EditMode {
	OFF = 0,
	CORRECTED = 1,
	SUGGEST = 2,
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

export type CursorOptionsMap = Record<SuggestionType, RANGE_CURSOR_MOVEMENT_OPTION>;

export type BracketOptionsMap = Record<SuggestionType, RANGE_BRACKET_MOVEMENT_OPTION>;

export interface FocusModeSettings {
	/**
	 * Whether the range should still be styled when it is focused
	 */
	show_styling: boolean;
	/**
	 * Whether the syntax of the range should be shown when it is focused
	 */
	show_syntax: boolean;
	/**
	 * Whether the metadata of the range should be shown when it is focused
	 */
	show_metadata: boolean;
	/**
	 * Whether the annotation in the annotations gutter should be focused when the range is focused
	 */
	focus_annotation: boolean;
	/**
	 * Whether comments hidden as icons should be shown when the range is focused
	 */
	show_comment: boolean;
}

export interface PluginSettings {
	/**
	 * String to store the version of the plugin settings (used for migrations)
	 */
	version: string;

	/**
	 * When opening a new view, determine how the editor should behave by default
	 * - 0: Regular (default) editing mode
	 * - 1: Corrected mode (ensure that edits do not break the syntax)
	 * - 2: Suggestion mode (convert edit operations into suggestion ranges)
	 */
	default_edit_mode: EditMode;
	/**
	 * When opening a new view, determine how the ranges should be visualised in LP/S mode by default
	 * - 0: Show all text
	 * - 1: Visualise 'accept' action (only show regular text and Addition Ranges)
	 * - 2: Visualise 'reject' action (only show regular text and Deletion Ranges)
	 */
	default_preview_mode: PreviewMode;
	/**
	 * How comments should be rendered while in live-preview mode
	 * - "inline": Show comments like all other markup, all text of the comment is visible inside the note itself
	 * - "icon": Comments are hidden away and replaced with a comment icon, hovering over the comment reveals the text
	 * - "none": Do not show comments in live preview mode, they are only visible in the gutter or global comment view
	 */
	comment_style: "inline" | "icon" | "none";
	/**
	 * Keep styling ranges even if cursor is inside it
	 */
	editor_styling: boolean;
	/**
	 * Settings for every edit mode determining how a range should be displayed when it is focused in the editor
	 */
	markup_focus: Record<EditMode, FocusModeSettings>;

	/**
	 * Render a gutter marking locations of ranges in the document
	 */
	diff_gutter: boolean;
	/**
	 * Hide the diff gutter if no suggestions are present in the note
	 */
	diff_gutter_hide_empty: boolean;

	/**
	 * Show the annotation gutter in the editor
 	 */
	annotation_gutter: boolean;
	/**
	 * Determine which annotations are included by default
	 */
	annotation_gutter_included_types: number;
	/**
	 * Hide the annotation gutter if no annotations are present in the note
	 */
	annotation_gutter_hide_empty: boolean;
	/**
	 * Determine whether the annotation gutter should be folded by default
	 */
	annotation_gutter_default_fold_state: boolean;
	/**
	 * Add a button next to the annotation gutter for quickly (un)folding the gutter
	 */
	annotation_gutter_fold_button: boolean;
	/**
	 * Add a resize handle next to the annotation gutter for quickly adjusting the gutter width
	 */
	annotation_gutter_resize_handle: boolean;
	/**
	 * When clicking on an annotation in the _editor_, focus its corresponding annotation in the gutter - if it exists
	 */
	annotation_gutter_focus_on_click: boolean;
	/**
	 * How much space the annotation gutter should take up
	 */
	annotation_gutter_width: number;

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
	toolbar_preview_button: boolean;
	/**
	 * Add a toggle button for quickly toggling suggestion mode on/off in the editor toolbar
	 */
	toolbar_edit_button: boolean;
	/**
	 * Show the labels on the buttons found in the header
	 */
	toolbar_show_buttons_labels: boolean;

	/**
	 * Add a button for quickly toggling preview mode in the status bar
	 */
	status_bar_preview_button: boolean;
	/**
	 * Add a button for quickly toggling suggestion mode in the status bar
	 */
	status_bar_edit_button: boolean;
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
	enable_timestamp_metadata: boolean;
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
	add_timestamp_metadata: boolean;
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
	 * Author name to use for metadata
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
	};
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
	regular_callback?: (...args: any[]) => void;

	/**
	 * Command with checking callback, if mobile, command will be set to editorCheckCallback by default to add the command to the mobile toolbar
	 */
	check_callback?: (checking: boolean, ...args: any[]) => boolean | void;
}
