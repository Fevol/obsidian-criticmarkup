import {CriticMarkupRanges, MetadataFields} from "../ranges";
import {type EditorEditChange, OperationReturn} from "./types";
import {EditorSelection, EditorState} from "@codemirror/state";
import {BracketOptionsMap, CursorOptionsMap} from "../../../types";
import {advance_cursor_head} from "./cursor";
import {mark_ranges, MarkType} from "../edit-logic";

export function text_delete(cursor_range: EditorEditChange, ranges: CriticMarkupRanges, offset: number,
                            backwards_delete: boolean, group_delete: boolean, state: EditorState,
                            delete_type: MarkType, cursor_options: CursorOptionsMap,
                            bracket_options: BracketOptionsMap, metadata_fields?: MetadataFields):
    OperationReturn {
    let cursor_from = cursor_range.from;
    let cursor_to = cursor_range.to;
    if (!cursor_range.selection) {
        const cursor_anchor = cursor_range.anchor!;
        let cursor_head = backwards_delete ? cursor_from : cursor_to;
        cursor_head = advance_cursor_head(cursor_anchor, cursor_head, ranges, !backwards_delete, group_delete,
            false, state, cursor_options, bracket_options);
        if (backwards_delete)
            cursor_from = cursor_head;
        else
            cursor_to = cursor_head;
    }

    const operations = mark_ranges(ranges, state.doc, cursor_from, cursor_to, "", delete_type, metadata_fields);

    offset += operations.reduce((acc, op) => acc + op.insert.length - (op.to - op.from), 0);

    return {
        selection: EditorSelection.cursor(backwards_delete ? cursor_from : cursor_to + offset),
        changes: operations,
        offset,
    }
}
