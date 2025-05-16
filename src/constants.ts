import { SuggestionType } from "./editor/base";
import {
	EditMode,
	type PluginSettings,
	PreviewMode,
	RANGE_BRACKET_MOVEMENT_OPTION,
	RANGE_CURSOR_MOVEMENT_OPTION,
} from "./types";

export const PLUGIN_VERSION = "0.2.1";
export const DATABASE_VERSION = 4;

export const DEFAULT_SETTINGS: PluginSettings = {
	version: PLUGIN_VERSION,

	default_edit_mode: EditMode.CORRECTED,
	default_preview_mode: PreviewMode.ALL,

	diff_gutter: true,

	editor_styling: false,
	diff_gutter_hide_empty: false,

	annotation_gutter: true,
	annotation_gutter_included_types: 31,
	annotation_gutter_hide_empty: false,
	annotation_gutter_default_fold_state: false,
	annotation_gutter_fold_button: true,
	annotation_gutter_resize_handle: true,

	annotation_gutter_width: 300,
	comment_style: "icon",

	tag_completion: true,
	tag_correcter: true,
	clipboard_remove_syntax: true,
	edit_info: true,

	toolbar_preview_button: true,
	toolbar_edit_button: true,
	toolbar_show_buttons_labels: true,

	status_bar_preview_button: true,
	status_bar_edit_button: true,
	status_bar_metadata_button: true,

	database_workers: 2,

	post_processor: true,
	live_preview: true,
	alternative_cursor_movement: true,

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
		},
	},
};

export const REQUIRES_FULL_RELOAD: Set<string> = new Set([
	"live_preview",
	"diff_gutter",
	"annotation_gutter",
	"comment_style",
	"tag_completion",
	"tag_correcter",
]);

export const REQUIRES_EDITOR_RELOAD: Set<string> = new Set([
	"enable_metadata",
]);

export const REQUIRES_DATABASE_REINDEX: Set<string> = new Set([
	"enable_metadata",
]);

export enum AnnotationInclusionType {
	ADDITION = 1 << 0,
	DELETION = 1 << 1,
	SUBSTITUTION = 1 << 2,
	HIGHLIGHT = 1 << 3,
	COMMENT = 1 << 4,
}
