import { Compartment, EditorSelection, RangeSet, StateField } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import { App, editorInfoField } from "obsidian";
import { CriticMarkupRange, SuggestionType } from "../../../base";
import { create_range } from "../../../base/edit-util/range-create";
import { annotation_gutter, AnnotationGutterView } from "./annotation-gutter";
import { annotationGutterMarkers, AnnotationMarker } from "./marker";

export { annotationGutterMarkers, AnnotationMarker };

// Keep the gutter here, as Obsidian *really* does not like the circular reference
// between Markers and Gutters (which is required for calling the moveGutter function)
export const annotationGutter: (
	app: App,
) => [StateField<RangeSet<AnnotationMarker>>, [[ViewPlugin<AnnotationGutterView>], unknown]] = (app: App) => [
	annotationGutterMarkers,
	annotation_gutter({
		class: "criticmarkup-comment-gutter" + (app.vault.getConfig("cssTheme") === "Minimal" ? " is-minimal" : ""),
		markers: v => v.state.field(annotationGutterMarkers),
	}) as [[ViewPlugin<AnnotationGutterView>], unknown],
];

export const annotationGutterCompartment = new Compartment();


export function addCommentToView(editor: EditorView, range: CriticMarkupRange | undefined) {
	const cursor = range ? range.full_range_back : editor.state.selection.main.head;
	const { app } = editor.state.field(editorInfoField);
	editor.dispatch(editor.state.update({
		changes: {
			from: cursor,
			to: cursor,
			insert: create_range(SuggestionType.COMMENT, ""),
		},
		selection: EditorSelection.cursor(cursor),
	}));
	const gutter = editor.plugin(annotationGutter(app)[1][0][0]);
	if (gutter) {
		setTimeout(() => {
			gutter.focusAnnotationThread((range ? range.base_range.from : cursor) + 1);
		});
	}
}
