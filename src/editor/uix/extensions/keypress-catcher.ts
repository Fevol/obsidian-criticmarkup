import {EditorView} from "@codemirror/view";

export let latest_keypress: KeyboardEvent | null = null;

export const editorKeypressCatcher = EditorView.domEventHandlers({
    keydown: (event, view) => {
        latest_keypress = event;
    }
});
