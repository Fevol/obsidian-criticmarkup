import type {EditorChange, EditorEditChange, OperationReturn} from "../edit-operations";
import {
    CM_All_Brackets,
    CriticMarkupRange,
    CriticMarkupRanges,
    METADATA_TYPE,
    MetadataFields, RangeType,
    SuggestionType
} from "../ranges";
import {objectIntersection} from "../../../util";
import {EditorSelection} from "@codemirror/state";


// Determine what to do if text is INSERTED into a range of this type
export enum INSERT_OPTION {
    // Always insert new text into range (outside brackets)
    REGULAR = "regular",
    // Always move text inserts outside of brackets (to left or right?)
    MOVE_OUTSIDE = "move_outside",
    // Always split existing range into two ranges
    SPLIT = "split",
    // Skip inserting text when in range
    SKIP = "skip",
}

// For every field, determine how two instances should be merged if inequal
export enum METADATA_MERGE_OPTION {
    // Disable action
    SKIP = "skip",
    // Split range into two ranges
    SPLIT = "split",
    // Move outside of range
    MOVE_OUTSIDE = "move_outside",
    // Choose value of old range
    OLD = "old",
    // Choose value of new range
    NEW = "new",
    // TODO: Other merge options possible: highest, lowest, ...
}


export type MetadataDifferenceOptions = {
    [key in METADATA_TYPE]: METADATA_MERGE_OPTION;
}

// Extend InsertOptionsMap with undefined: INSERT_OPTION
export type InsertOptionsMap = Record<SuggestionType | "", INSERT_OPTION>;



function construct_markup(range_type: SuggestionType | undefined, metadata: MetadataFields | undefined, text: string) {
    const brackets = CM_All_Brackets[range_type as keyof typeof CM_All_Brackets];
    if (!brackets)
        return text;
    if (!metadata)
        return brackets[0] + text + brackets.slice(1).join();
    return brackets[0] + JSON.stringify(metadata) + "@@" + text + brackets.slice(1).join();
}


function determine_insert_action(range: CriticMarkupRange,
                                 insert_actions: InsertOptionsMap,
                                 metadata_fields?: MetadataFields, metadata_merge?: MetadataDifferenceOptions):
    {insert_action?: INSERT_OPTION,  metadata_type?: METADATA_TYPE, merged_metadata?: MetadataFields} {

    const insert_action = insert_actions[range.type];
    if (insert_action === INSERT_OPTION.SKIP) {
        return { insert_action: INSERT_OPTION.SKIP };
    } else if (insert_action === INSERT_OPTION.MOVE_OUTSIDE) {
        return { insert_action: INSERT_OPTION.MOVE_OUTSIDE };
    } else if (insert_action === INSERT_OPTION.SPLIT) {
        return { insert_action: INSERT_OPTION.SPLIT };
    }


    const merged_metadata: MetadataFields = Object.assign({}, range.fields, metadata_fields);
    const metadata_intersection = objectIntersection(metadata_fields ?? {}, range.fields ?? {})
        .filter(key => metadata_merge![key as keyof typeof metadata_merge] !== metadata_fields![key]);

    for (const key of metadata_intersection) {
        if (metadata_fields![key] !== range.fields[key]) {
            const action: METADATA_MERGE_OPTION = metadata_merge![key as keyof typeof metadata_merge];
            if (action === METADATA_MERGE_OPTION.SKIP) {
                return { insert_action: INSERT_OPTION.SKIP, metadata_type: key as METADATA_TYPE };
            } else if (action === METADATA_MERGE_OPTION.SPLIT) {
                return { insert_action: INSERT_OPTION.SPLIT, metadata_type: key as METADATA_TYPE };
            } else if (action === METADATA_MERGE_OPTION.MOVE_OUTSIDE) {
                return { insert_action: INSERT_OPTION.MOVE_OUTSIDE, metadata_type: key as METADATA_TYPE };
            } else if (action === METADATA_MERGE_OPTION.OLD) {
                merged_metadata[key] = range.fields[key];
            }
        }
    }
    return { insert_action: INSERT_OPTION.REGULAR, merged_metadata };
}





export function text_insert(cursor_range: EditorEditChange, ranges: CriticMarkupRanges, offset: number,
                            insert_type: SuggestionType | undefined,  insert_options: InsertOptionsMap,
                            metadata_fields?: MetadataFields, metadata_merge?: MetadataDifferenceOptions
): OperationReturn {
    let range = ranges.range_directly_adjacent_to_cursor(cursor_range.to, false);
    let adj_range: CriticMarkupRange | undefined = undefined;
    let cursor_head = cursor_range.to;
    let insert_action: INSERT_OPTION | undefined = undefined;

    let metadata = metadata_fields;
    if (range) {
        let {insert_action, metadata_type, merged_metadata} =
            determine_insert_action(range, insert_options, metadata_fields, metadata_merge);

        const move_left_bracket = range.touches_left_bracket(cursor_head, false, true, true);
        const move_right_bracket = range.touches_right_bracket(cursor_head) || insert_action === INSERT_OPTION.MOVE_OUTSIDE;
        if (move_left_bracket || move_right_bracket) {
            adj_range = ranges.adjacent_range(range, move_left_bracket, true);
            // NOTE: Does not cover case `{++++}{--░--}{====}`
            if (adj_range) {
                const {insert_action: insert_action_2, metadata_type: metadata_type_2, merged_metadata: merged_metadata_2} =
                    determine_insert_action(adj_range, insert_options, metadata_fields, metadata_merge);

                // GOAL: Check if switching to the adjacent range is beneficial
                // NOTE: Current range is guaranteed to be the closest range to the cursor,
                //       so we don't need additional logic for switching range based on cursor location
                if (insert_action_2 === INSERT_OPTION.REGULAR && insert_action !== INSERT_OPTION.REGULAR) {
                    range = adj_range;
                    insert_action = insert_action_2;
                    metadata_type = metadata_type_2;
                    merged_metadata = merged_metadata_2;
                }
            }
        }

        metadata = merged_metadata ?? metadata;

        // STEP 1: Handle cursor movement
        if (insert_action === INSERT_OPTION.SKIP) {
            return { debug: { range, metadata_type } };
        }

        if (insert_action === INSERT_OPTION.MOVE_OUTSIDE) {
            if (!range.touches_left_bracket(cursor_head, false, true, true))
                cursor_head = range.to;
            else
                cursor_head = range.from;
            range = undefined;
        } else {
            if (insert_action === INSERT_OPTION.SPLIT) {
                cursor_head = range.cursor_move_outside(cursor_head, true);
                if (cursor_head === range.from || cursor_head === range.to) {
                    insert_action = INSERT_OPTION.REGULAR;
                    range = undefined;
                } else
                    cursor_head = range.cursor_move_inside(cursor_head, true);
            } else {
                cursor_head = range.cursor_move_inside(cursor_head, true);
            }
        }
    } else {
        insert_action = insert_options[""];
        if (insert_action === INSERT_OPTION.SKIP)
            return { debug: {} };
    }

    let text = "";
    const changes: EditorChange[] = [];
    let cursor_offset = 0;

    if (!range) {
        // No range, just insert as normal
        text = construct_markup(insert_type, metadata, cursor_range.inserted);
        changes.push({ from: cursor_head, to: cursor_head, insert: text });
        cursor_offset = -3;
    } else {
        if (insert_action === INSERT_OPTION.SPLIT) {
            // Split range or just insert into range (update metadata)
            const split_range = range.split_range(cursor_head);
            console.log(split_range);
            text = split_range[0] + construct_markup(insert_type, metadata, cursor_range.inserted) + split_range[1];
            changes.push({ from: cursor_head, to: cursor_head, insert: text });
            cursor_offset -= split_range.reduce((a, b) => a + b.length, 0);
        } else {
            // Check if metadata is identical or not (either full range replacement, or just text insertion)
            text = cursor_range.inserted;
            if (metadata !== range.metadata) {
                const metadata_text = JSON.stringify(metadata) + "@@";
                changes.push({
                    from: range.from + 3,
                    to: range.metadata ? range.metadata + 2 : range.from + 3,
                    insert: metadata_text
                });
            }
            changes.push({ from: cursor_head, to: cursor_head, insert: text });
        }
    }

    offset += changes.map(change => change.insert.length - (change.to - change.from)).reduce((a, b) => a + b, 0);

    return { changes, selection: EditorSelection.cursor(cursor_head + cursor_offset + offset), offset };
}
