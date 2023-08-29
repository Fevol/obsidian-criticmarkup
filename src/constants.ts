import { type PluginSettings, PreviewMode } from './types';

export const DEFAULT_SETTINGS: PluginSettings = {
	preview_mode: PreviewMode.ALL,
	editor_preview_button: true,
	editor_gutter: true,

	editor_styling: false,
	hide_empty_gutter: false,
	comment_style: "block",

	tag_completion: true,
	node_correcter: true,
	clipboard_remove_syntax: true,

	suggest_mode: false,
	editor_suggest_button: true,

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
