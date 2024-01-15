import {type EditorState, StateEffect, StateField} from "@codemirror/state";
import {EditorView} from "@codemirror/view";

const editorKeypressEffect = StateEffect.define<KeyboardEvent>();

export const editorKeypressStateField = StateField.define<KeyboardEvent | null>({
    create(state: EditorState) {
        return null;
    },
    update(value, tr) {
        // Get keyboard event from tr effect
        for (const effect of tr.effects) {
            if (effect.is(editorKeypressEffect)) {
                return effect.value;
            }
        }
        return null;
    },
});

export const editorKeypressCatcher = EditorView.domEventHandlers({
    keydown: (event, view) => {
        view.dispatch({ effects: [ editorKeypressEffect.of(event) ] });
    }
});
