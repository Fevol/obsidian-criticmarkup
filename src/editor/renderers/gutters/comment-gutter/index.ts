import { CommentMarker, commentGutterMarkers } from './marker';
import {comment_gutter, CommentGutterView} from './comment_gutter';
import {RangeSet, StateField} from "@codemirror/state";
import {EditorView, ViewPlugin} from "@codemirror/view";
import {CriticMarkupRange} from "../../../base";

export { CommentMarker, commentGutterMarkers }

// Keep the gutter here, as Obsidian *really* does not like the circular reference
// between Markers and Gutters (which is required for calling the moveGutter function)
export const commentGutter: [StateField<RangeSet<CommentMarker>>, [[ViewPlugin<CommentGutterView>], unknown]] = [
	commentGutterMarkers,
	comment_gutter({
		class: 'criticmarkup-comment-gutter' + (app.vault.getConfig('cssTheme') === "Minimal" ? ' is-minimal' : ''),
		markers: v => v.state.field(commentGutterMarkers),
	}) as [[ViewPlugin<CommentGutterView>], unknown],
];


export function focusCommentThread(editor: EditorView, range: CriticMarkupRange | undefined) {
	let cursor = range ? range.full_range_back : editor.state.selection.main.head;
	editor.dispatch(editor.state.update({
		changes: {
			from: cursor,
			to: cursor,
			insert: '{>><<}',
		},
	}));
	if (editor.plugin(commentGutter[1][0][0])) {
		setTimeout(() => {
			editor.plugin(commentGutter[1][0][0])!.focusCommentThread((range ? range.base_range.from : cursor) + 1);
		});
	}
}
