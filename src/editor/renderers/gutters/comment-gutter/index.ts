import { CommentMarker, commentGutterMarkers } from './marker';
import {comment_gutter, CommentGutterView} from './comment_gutter';
import {EditorSelection, RangeSet, StateField} from "@codemirror/state";
import {EditorView, ViewPlugin} from "@codemirror/view";
import {CriticMarkupRange, SuggestionType} from "../../../base";
import {create_range} from "../../../base/edit-util/range-create";

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


export function addCommentToView(editor: EditorView, range: CriticMarkupRange | undefined) {
	const cursor = range ? range.full_range_back : editor.state.selection.main.head;
	editor.dispatch(editor.state.update({
		changes: {
			from: cursor,
			to: cursor,
			insert: create_range(SuggestionType.COMMENT, ""),
		},
		selection: EditorSelection.cursor(cursor),
	}));
	if (editor.plugin(commentGutter[1][0][0])) {
		setTimeout(() => {
			editor.plugin(commentGutter[1][0][0])!.focusCommentThread((range ? range.base_range.from : cursor) + 1);
		});
	}
}
