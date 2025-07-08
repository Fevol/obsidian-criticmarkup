import { Compartment, RangeSet, StateField } from "@codemirror/state";
import { ViewPlugin } from "@codemirror/view";
import { App } from "obsidian";
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


