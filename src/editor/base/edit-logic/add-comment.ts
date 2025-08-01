import { EditorView } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";

import { CriticMarkupRange, SuggestionType } from "../ranges";

import { create_range } from "../edit-util/range-create";

import { annotationGutterFocusAnnotation } from "../../renderers/gutters/annotations-gutter";
import { pluginSettingsField } from "../../uix";

export function addCommentToView(editor: EditorView, range: CriticMarkupRange | undefined, scroll: boolean = false): void {
    const settings = editor.state.field(pluginSettingsField);
    const cursor = range ? range.full_range_back : editor.state.selection.main.head;
    const reply_idx = range ? range.full_thread.length : -1;

    editor.dispatch(editor.state.update({
        changes: {
            from: cursor,
            to: cursor,
            insert: create_range(settings, SuggestionType.COMMENT, ""),
        },
        selection: EditorSelection.cursor(cursor),
        scrollIntoView: scroll,
    }));


    // EXPL: This code ensures that the input of a new comment is focused on when created
    // FIXME: A more canonical way is required to wait till the CM state update (the new comment element needs to be rendered)
    //   Some attempts that did not work:
    //    - using `sequential` in the `update` method
    activeWindow.setTimeout(() => { editor.dispatch(editor.state.update({
        annotations: [
            annotationGutterFocusAnnotation.of({
                from: cursor,
                to: cursor,
                index: reply_idx,
            }),
        ]
    }))});
}
