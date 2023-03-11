export interface PluginSettings {
	suggestion_status: number;

	editor_preview_button: boolean;
	editor_gutter: boolean;
	editor_styling: boolean;

	tag_completion: boolean;
	node_correcter: boolean;

	suggest_mode: boolean;

	post_processor: boolean;
	live_preview: boolean;
}

export interface CriticMarkupNode {
	from: number,
	middle?: number,
	to: number,
	type: string
}