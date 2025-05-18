import { Compartment, EditorSelection, RangeSet, StateField } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import { App } from "obsidian";
import { CriticMarkupRange, SuggestionType } from "../../../base";
import { create_range } from "../../../base/edit-util/range-create";
import { annotation_gutter, annotationGutterFocusAnnotation, AnnotationGutterView } from "./annotation-gutter";
import { annotationGutterMarkers, AnnotationMarker } from "./marker";

export { annotationGutterMarkers, annotationGutterFocusAnnotation, AnnotationMarker };

// Keep the gutter here, as Obsidian *really* does not like the circular reference
// between Markers and Gutters (which is required for calling the moveGutter function)
export const annotationGutter: (
	app: App,
) => [StateField<RangeSet<AnnotationMarker>>, [[ViewPlugin<AnnotationGutterView>], unknown]] = (app: App) => [
	annotationGutterMarkers,
	annotation_gutter({
		class: "cmtr-anno-gutter" + (app.vault.getConfig("cssTheme") === "Minimal" ? " is-minimal" : ""),
		markers: v => v.state.field(annotationGutterMarkers),
	}) as [[ViewPlugin<AnnotationGutterView>], unknown],
];

export const annotationGutterCompartment = new Compartment();


export function addCommentToView(editor: EditorView, range: CriticMarkupRange | undefined) {
	const cursor = range ? range.full_range_back : editor.state.selection.main.head;
	editor.dispatch(editor.state.update({
		changes: {
			from: cursor,
			to: cursor,
			insert: create_range(SuggestionType.COMMENT, ""),
		},
		selection: EditorSelection.cursor(cursor),
		annotations: [
			annotationGutterFocusAnnotation.of({
				from: cursor,
				to: cursor,
				index: range ? range.full_thread.length : -1,
			}),
		]
	}));
}
