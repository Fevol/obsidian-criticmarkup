import {
    CriticMarkupRange,
    CriticMarkupRanges,
    METADATA_TYPE,
    MetadataFields, RangeType,
    SuggestionType
} from "../ranges";
import {MetadataDifferenceOptions} from "./insert";
import {type EditorEditChange, OperationReturn} from "../edit-operations";
import {EditorState} from "@codemirror/state";
import {CursorOptionsMap, BracketOptionsMap} from "../../../types";
import {advance_cursor_head} from "./movement";
import {objectIntersection} from "../../../util";

// TODO: Split is not available as setting
export enum DELETE_OPTION {
    // Mark character(s) in given range as deletion_type
    REGULAR = "regular",
    // Skip range for deletion, move cursor
    SKIP = "skip",
    // Split range
    SPLIT = "split",
}


export enum METADATA_DELETE_OPTION {
    // Skip range for deletion, move cursor
    SKIP = "skip",
    // Split range if metadata is different
    SPLIT = "split",
    // Choose value of old range
    OLD = "old",
    // Choose value of new range
    NEW = "new",
}


// TODO: Delete option depends on provided rangetype
type DeleteOptionsMap = Record<SuggestionType, DELETE_OPTION>;
type MetadataDeleteOptionsMap = Record<METADATA_TYPE, METADATA_DELETE_OPTION>;


function determine_delete_action(range: CriticMarkupRange, delete_type: RangeType,
                                 delete_actions: DeleteOptionsMap,
                                 metadata_fields?: MetadataFields, metadata_merge?: MetadataDeleteOptionsMap):
    {delete_action?: DELETE_OPTION,  metadata_type?: METADATA_TYPE, merged_metadata?: MetadataFields} {

    const merged_metadata: MetadataFields = Object.assign({}, range.fields, metadata_fields);
    const metadata_intersection = objectIntersection(metadata_fields ?? {}, range.fields ?? {})
        .filter(key => metadata_merge![key as keyof typeof metadata_merge] !== metadata_fields![key]);

    for (const key of metadata_intersection) {
        if (metadata_fields![key] !== range.fields[key]) {
            const action: METADATA_DELETE_OPTION = metadata_merge![key as keyof typeof metadata_merge];
            if (action === METADATA_DELETE_OPTION.SKIP) {
                return { delete_action: DELETE_OPTION.SKIP, metadata_type: key as METADATA_TYPE };
            } else if (action === METADATA_DELETE_OPTION.SPLIT) {
                return { delete_action: DELETE_OPTION.SPLIT, metadata_type: key as METADATA_TYPE };
            } else if (action === METADATA_DELETE_OPTION.OLD) {
                merged_metadata[key] = range.fields[key];
            }
        }
    }

    const delete_action = delete_actions[range.type];
    if (delete_action === DELETE_OPTION.SKIP) {
        return { delete_action: DELETE_OPTION.SKIP };
    } else if (delete_action === DELETE_OPTION.SPLIT) {
        return { delete_action: DELETE_OPTION.SPLIT };
    }

    if (delete_type === "") {
        return { delete_action: DELETE_OPTION.REGULAR, merged_metadata };
    } else if (delete_type !== range.type) {
        return { delete_action: DELETE_OPTION.SPLIT };
    }

    return { delete_action: DELETE_OPTION.REGULAR, merged_metadata };
}




export function text_delete(cursor_range: EditorEditChange, ranges: CriticMarkupRanges, offset: number,
                            backwards_delete: boolean, group_delete: boolean, state: EditorState,
                            delete_type: SuggestionType | undefined, delete_options: DeleteOptionsMap, cursor_options: CursorOptionsMap,
                            bracket_options: BracketOptionsMap,
                            metadata_fields?: MetadataFields, metadata_merge?: MetadataDifferenceOptions):
    OperationReturn {


    let cursor_from = cursor_range.from;
    let cursor_to = cursor_range.to;
    if (!cursor_range.selection) {
        let cursor_head = cursor_range.head!;
        let cursor_anchor = cursor_head === cursor_from ? cursor_to : cursor_from;

        cursor_head = advance_cursor_head(cursor_anchor, cursor_head, ranges, !backwards_delete, group_delete,
                                false, state, cursor_options, bracket_options);
        if (backwards_delete)
            cursor_from = cursor_head;
        else
            cursor_to = cursor_head;
    }

    // Check all ranges between cursor_from and cursor_to
    let ranges_between = ranges.ranges_in_range(cursor_from, cursor_to, true);
    let all_ranges = [];
    let last_range_end = cursor_from;
    // TODO: Could be done in a single pass but I'm a bit too lazy for that right now
    for (const range of ranges_between) {
        if (range.from > last_range_end)
            all_ranges.push({from: last_range_end, to: range.from, type: ""});

        if (delete_options[range.type] !== DELETE_OPTION.SKIP)
            all_ranges.push(range);
        last_range_end = range.to;
    }
    if (last_range_end < cursor_to)
        all_ranges.push({from: last_range_end, to: cursor_to});

    let joined_ranges = [];

    for (const range of all_ranges) {

    }





    return {};
}
