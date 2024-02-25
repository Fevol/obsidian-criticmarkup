import type {EditorEditChange, OperationReturn} from "./types";
import { CriticMarkupRanges, MetadataFields } from "../ranges";
import {EditorSelection, EditorState} from "@codemirror/state";
import {mark_ranges, MarkType} from "../edit-logic";


export function text_insert(cursor_range: EditorEditChange, ranges: CriticMarkupRanges, offset: number,
                            state: EditorState, insert_type: MarkType, metadata_fields?: MetadataFields): OperationReturn {
    const operations = mark_ranges(ranges, state.doc, cursor_range.from, cursor_range.to, cursor_range.inserted, insert_type, metadata_fields);

    offset += operations.reduce((acc, op) => acc + op.insert.length - (op.to - op.from), 0);

    return {
        selection: EditorSelection.cursor(cursor_range.to + offset),
        changes: operations,
        offset,
    }
}
