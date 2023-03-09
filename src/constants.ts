import type { PluginSettings } from './types';


export const DEFAULT_SETTINGS: PluginSettings = {
	suggestion_status: 0,
	editor_preview_button: true,
	editor_gutter: true,
	editor_styling: false,

	tag_completion: true,
	node_correcter: true,

	post_processor: true,
	live_preview: true
}