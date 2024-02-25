import {EditorEditChange, OperationReturn}  from "./types";
import {CriticMarkupRanges, MetadataFields} from "../ranges";
import {EditorSelection, EditorState} from "@codemirror/state";
import {mark_ranges, MarkType} from "../edit-logic";

export function text_replace(cursor_range: EditorEditChange, ranges: CriticMarkupRanges, offset: number,
                            backwards_delete: boolean, state: EditorState,
                            replace_type: MarkType, metadata_fields?: MetadataFields):
    OperationReturn {
    const operations = mark_ranges(ranges, state.doc, cursor_range.from, cursor_range.to, cursor_range.inserted, replace_type, metadata_fields);

    offset += operations.reduce((acc, op) => acc + op.insert.length - (op.to - op.from), 0);

    return {
        selection: EditorSelection.cursor(backwards_delete ? cursor_range.from : cursor_range.to + offset),
        changes: operations,
        offset,
    }
}
