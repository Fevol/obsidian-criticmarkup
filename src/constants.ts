import { type PluginSettings, PreviewMode } from './types';

export const DEFAULT_SETTINGS: PluginSettings = {
	preview_mode: PreviewMode.ALL,
	suggest_mode: false,

	editor_gutter: true,

	editor_styling: false,
	hide_empty_gutter: false,
	comment_style: "block",

	tag_completion: true,
	node_correcter: true,
	clipboard_remove_syntax: true,


	editor_preview_button: true,
	editor_suggest_button: true,
	show_editor_buttons_labels: true,

	status_bar_preview_button: true,
	status_bar_suggest_button: true,

	database_workers: 2,

	post_processor: true,
	live_preview: true,
	alternative_cursor_movement: true,
};


export const REQUIRES_FULL_RELOAD: Set<string> = new Set([
	"preview_mode",
	"live_preview",
	"alternative_live_preview",
	"editor_gutter",

	"hide_empty_gutter",
	"comment_style",

	"tag_completion",
	"node_correcter",
	"suggest_mode",
]);
