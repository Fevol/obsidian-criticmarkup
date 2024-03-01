import {
	type PluginSettings,
	PreviewMode,
	RANGE_BRACKET_MOVEMENT_OPTION,
	RANGE_CURSOR_MOVEMENT_OPTION,
	SuggestMode
} from './types';
import {SuggestionType} from "./editor/base";

export const DEFAULT_SETTINGS: PluginSettings = {
	version: "0.2.0",

	preview_mode: PreviewMode.ALL,
	suggest_mode: SuggestMode.OFF,

	editor_gutter: true,

	editor_styling: false,
	hide_empty_gutter: false,
	hide_empty_suggestion_gutter: false,
	hide_empty_comment_gutter: false,

	comment_gutter_width: 300,
	comment_style: "block",

	tag_completion: true,
	tag_correcter: true,
	clipboard_remove_syntax: true,
	edit_info: true,

	editor_preview_button: true,
	editor_suggest_button: true,
	show_editor_buttons_labels: true,

	status_bar_preview_button: true,
	status_bar_suggest_button: true,
	status_bar_metadata_button: true,

	database_workers: 2,

	post_processor: true,
	live_preview: true,
	alternative_cursor_movement: true,
	edit_mode: true,


	enable_metadata: false,
	enable_author_metadata: false,
	enable_timestamp_metadata: false,
	enable_completed_metadata: false,
	enable_style_metadata: false,
	enable_color_metadata: false,

	add_metadata: false,
	add_author_metadata: false,
	add_timestamp_metadata: false,
	add_completed_metadata: false,
	add_style_metadata: false,
	add_color_metadata: false,

	author: "",

	suggestion_mode_operations: {
		cursor_movement: {
			[SuggestionType.ADDITION]: RANGE_CURSOR_MOVEMENT_OPTION.IGNORE_METADATA,
			[SuggestionType.DELETION]: RANGE_CURSOR_MOVEMENT_OPTION.IGNORE_METADATA,
			[SuggestionType.SUBSTITUTION]: RANGE_CURSOR_MOVEMENT_OPTION.IGNORE_METADATA,
			[SuggestionType.HIGHLIGHT]: RANGE_CURSOR_MOVEMENT_OPTION.IGNORE_METADATA,
			[SuggestionType.COMMENT]: RANGE_CURSOR_MOVEMENT_OPTION.IGNORE_COMPLETELY,
		},
		bracket_movement: {
			[SuggestionType.ADDITION]: RANGE_BRACKET_MOVEMENT_OPTION.STAY_INSIDE,
			[SuggestionType.DELETION]: RANGE_BRACKET_MOVEMENT_OPTION.STAY_INSIDE,
			[SuggestionType.SUBSTITUTION]: RANGE_BRACKET_MOVEMENT_OPTION.STAY_INSIDE,
			[SuggestionType.HIGHLIGHT]: RANGE_BRACKET_MOVEMENT_OPTION.STAY_INSIDE,
			[SuggestionType.COMMENT]: RANGE_BRACKET_MOVEMENT_OPTION.STAY_INSIDE,
		}
	}
};


export const REQUIRES_FULL_RELOAD: Set<string> = new Set([
	"preview_mode",
	"edit_mode",
	"live_preview",
	"alternative_live_preview",
	"editor_gutter",

	"hide_empty_gutter",
	"comment_style",

	"tag_completion",
	"tag_correcter",
	"suggest_mode",
	"suggestion_mode_cursor_movement",
]);
