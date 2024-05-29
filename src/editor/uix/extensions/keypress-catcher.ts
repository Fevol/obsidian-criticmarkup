import { EditorView } from "@codemirror/view";

export let latest_event: KeyboardEvent | MouseEvent | null = null;

export const editorKeypressCatcher = EditorView.domEventHandlers({
	keydown: (event, view) => {
		latest_event = event;
	},
	contextmenu: (event, view) => {
		latest_event = event;
	},
});
