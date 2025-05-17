import {annotationGutterFocusAnnotation} from "../../renderers/gutters/annotations-gutter";
import {EditorState} from "@codemirror/state";


export const focusAnnotation = EditorState.transactionExtender.of((tr) => {
    if (tr.isUserEvent('select') && tr.selection!.main.anchor === tr.selection!.main.head) {
        return {
            annotations: [
                annotationGutterFocusAnnotation.of({
                    cursor: tr.selection!.main.anchor
                })
            ]
        }
    }
    return {};
});
