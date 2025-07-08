import type {Editor} from "obsidian";
import type {CriticMarkupRange} from "../base";

export function centerRangeInEditorView(editor: Editor, range: CriticMarkupRange) {
    editor.scrollIntoView({ from: editor.offsetToPos(range.from), to: editor.offsetToPos(range.to) }, true);
}
