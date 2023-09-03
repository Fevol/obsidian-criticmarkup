import { treeParser } from '../tree-parser';
import { type EditorView } from '@codemirror/view';
import { type PluginSettings } from '../../types';


export function text_copy(settings: PluginSettings, event: ClipboardEvent, view: EditorView) {
	if (event.clipboardData && settings.clipboard_remove_syntax) {
		const selection = view.state.selection.main;
		const nodes = view.state.field(treeParser).nodes;

		const removed_syntax = nodes.unwrap_in_range(view.state.doc, selection.from, selection.to).output;
		event.clipboardData.setData('text/plain', removed_syntax);
		event.preventDefault();
	}
}
