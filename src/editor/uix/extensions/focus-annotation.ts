import {annotationGutterFocusAnnotation} from "../../renderers/gutters/annotations-gutter";
import {EditorState} from "@codemirror/state";
import type {PluginSettings} from "../../../types";
import {markupFocusEffect} from "../../renderers/live-preview";


export const focusAnnotation = (settings: PluginSettings) => EditorState.transactionExtender.of((tr) => {
    if (tr.newSelection.main !== tr.startState.selection.main) {
        const effects = [], annotations = [];
        if (settings.annotation_gutter_focus_on_click) {
            annotations.push(
                annotationGutterFocusAnnotation.of({
                    from: tr.selection!.main.from,
                    to: tr.selection!.main.to,
                })
            );
        }

        effects.push(
            markupFocusEffect.of({
                from: tr.selection!.main.from,
                to: tr.selection!.main.to
            })
        );

        return { effects, annotations };
    }
    return {};
});
