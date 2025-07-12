import { Compartment } from "@codemirror/state";
import { annotation_gutter, AnnotationGutterView, annotationGutterView,
	annotationGutterFocusAnnotation, annotationGutterFoldAnnotation, annotationGutterWidthAnnotation, annotationGutterHideEmptyAnnotation,
	annotationGutterResizeHandleAnnotation, annotationGutterFoldButtonAnnotation, annotationGutterFocusThreadAnnotation
 } from "./annotation-gutter";
import { annotationGutterMarkers, AnnotationMarker } from "./marker";
import type CommentatorPlugin from "../../../../main";

export {
	AnnotationGutterView, annotationGutterMarkers, AnnotationMarker, annotationGutterView,
	annotationGutterFocusAnnotation, annotationGutterFoldAnnotation, annotationGutterWidthAnnotation, annotationGutterHideEmptyAnnotation,
	annotationGutterResizeHandleAnnotation, annotationGutterFoldButtonAnnotation, annotationGutterFocusThreadAnnotation,
};

// NOTE: Keep the gutter here, as Obsidian *really* does not like the circular reference
// 		 between Markers and Gutters (which is required for calling the moveGutter function)
export const annotationGutter = (plugin: CommentatorPlugin) => [
	annotationGutterMarkers,
	annotation_gutter({
		class: "cmtr-anno-gutter " + (plugin.app.vault.getConfig("cssTheme") === "Minimal" ? " is-minimal" : ""),
		markers: v => v.state.field(annotationGutterMarkers),
		foldState: plugin.settings.annotation_gutter_default_fold_state,
		width: plugin.settings.annotation_gutter_width,
		hideOnEmpty: plugin.settings.annotation_gutter_hide_empty,
		includeFoldButton: plugin.settings.annotation_gutter_fold_button,
		includeResizeHandle: plugin.settings.annotation_gutter_resize_handle,
	}),
];

export const annotationGutterCompartment = new Compartment();


