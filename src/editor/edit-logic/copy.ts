import { nodesInSelection } from '../editor-util';
import { treeParser } from '../tree-parser';
import { type Tree } from '@lezer/common';
import { type EditorView } from '@codemirror/view';
import { type PluginSettings } from '../../types';


export function text_copy(settings: PluginSettings, event: ClipboardEvent, view: EditorView) {
	if (event.clipboardData && settings.clipboard_remove_syntax) {
		const selection = view.state.selection.main;
		const tree: Tree = view.state.field(treeParser).tree;
		const nodes = nodesInSelection(tree, selection.from, selection.to);

		const removed_syntax = nodes.unwrap_in_range(view.state.doc, selection.from, selection.to).output;
		event.clipboardData.setData('text/plain', removed_syntax);
		event.preventDefault();
	}
}
