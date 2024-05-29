import { type EditorView } from "@codemirror/view";
import { type PluginSettings } from "../../../types";

import { rangeParser } from "../edit-util";

export function text_copy(settings: PluginSettings, event: ClipboardEvent, view: EditorView) {
	if (event.clipboardData && settings.clipboard_remove_syntax) {
		const selection = view.state.selection.main;
		const ranges = view.state.field(rangeParser).ranges;

		const removed_syntax = ranges.unwrap_in_range(view.state.doc, selection.from, selection.to).output;
		event.clipboardData.setData("text/plain", removed_syntax);
		event.preventDefault();
	}
}
