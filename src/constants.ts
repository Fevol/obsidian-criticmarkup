import type { PluginSettings } from './types';


export const DEFAULT_SETTINGS: PluginSettings = {
	suggestion_status: 0,
	editor_preview_button: true,
	editor_gutter: true,

	editor_styling: false,
	hide_empty_gutter: false,

	tag_completion: true,
	node_correcter: true,

	suggest_mode: false,
	editor_suggest_button: true,

	post_processor: true,
	live_preview: true,
};