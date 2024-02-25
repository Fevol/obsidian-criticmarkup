import {
    CM_All_Brackets,
    CriticMarkupRange,
    CriticMarkupRanges,
    MetadataFields,
    SubstitutionRange,
    SuggestionType
} from "../ranges";
import {Text} from "@codemirror/state";
import {EditorChange} from "../edit-operations";


export enum MarkAction {
    REGULAR = "regular",
    CLEAR = "clear",
    NONE = "none",
}
export type MarkType = SuggestionType | MarkAction;


function can_merge(cursor: number, range?: CriticMarkupRange, type?: SuggestionType, metadata_fields?: MetadataFields, left = false): SuggestionType | undefined {
    if (!range || !type)
        return undefined;

    // Range cannot be merged if it is already fully included in range
    if (left && range.touches_left_bracket(cursor, false, true, true) || !left && range.touches_right_bracket(cursor, false, true))
        return undefined;


    // TODO: Metadata difference should be computed here
    // TODO: Nodes filtered in mark_ranges should have same output here
    // if (METADATA_DIFFERENT)
    //      return false;


    if (range.type === SuggestionType.SUBSTITUTION) {
        return (!left && (type === SuggestionType.DELETION || ((type === SuggestionType.ADDITION || type === SuggestionType.SUBSTITUTION) && cursor >= (range as SubstitutionRange).middle)))
            || (left && (type === SuggestionType.ADDITION || ((type === SuggestionType.DELETION || type === SuggestionType.SUBSTITUTION) && cursor <= (range as SubstitutionRange).middle + 2)))
            ? SuggestionType.SUBSTITUTION : undefined;
    } else if (!left && (type === SuggestionType.DELETION || type === SuggestionType.SUBSTITUTION) && range.type === SuggestionType.ADDITION) {
        return SuggestionType.SUBSTITUTION
    } else if (left && (type === SuggestionType.ADDITION || type === SuggestionType.SUBSTITUTION) && range.type === SuggestionType.DELETION) {
        return SuggestionType.SUBSTITUTION;
    } else if (range.type !== type) {
        return undefined;
    }

    return range.type;
}



export function create_suggestion(inserted: string, deleted: string, metadata_fields?: MetadataFields) {
    return create_range(inserted, deleted, ["", ""], metadata_fields,
        inserted && deleted ? SuggestionType.SUBSTITUTION : (inserted ? SuggestionType.ADDITION : SuggestionType.DELETION));
}

export function create_range(inserted: string, deleted: string, affixes: [string, string], metadata_fields?: MetadataFields, type?: SuggestionType) {
    if (!type)
        return deleted + inserted;

    const brackets = CM_All_Brackets[type];
    const output = brackets[0] + (metadata_fields && Object.keys(metadata_fields).length ? JSON.stringify(metadata_fields) + "@@" : "") +
        (type === SuggestionType.SUBSTITUTION ? deleted + brackets[1] + inserted + brackets[2]
            : deleted + inserted + brackets[1]);
    return affixes[0] + output + affixes[1];
}

function mark_range(ranges: CriticMarkupRanges, text: Text, from: number, to: number, inserted: string, type: MarkType, metadata_fields?: MetadataFields): EditorChange | undefined {
    const in_range = ranges.filter_range(from, to, true);

    const left_range = in_range.range_directly_adjacent_to_cursor(from, true);
    const right_range = in_range.range_directly_adjacent_to_cursor(to, false);
    const affixes: [string, string] = ["", ""];

    function split_left_range() {
        if (left_range?.type) {
            if (left_range.touches_left_bracket(from, false, true, true)) {
                from = left_range.from;
            } else if (!left_range.touches_right_bracket(from, false, true)) {
                if (left_range.type === SuggestionType.SUBSTITUTION && (left_range as SubstitutionRange).contains_separator(from, to)) {
                    const contents = left_range.unwrap_slice(0, from - left_range.from);
                    affixes[0] = create_range("", contents, ["", ""], left_range.fields, SuggestionType.DELETION);
                    from = left_range.from;
                } else {
                    affixes[0] = left_range.split_range(from)[0];
                }
            } else {
                from = left_range.to;
            }
        }
    }

    function split_right_range() {
        if (right_range?.type) {
            if (right_range.touches_right_bracket(to, false, true)) {
                to = right_range.to;
            } else if (!right_range.touches_left_bracket(to, false, true, true)) {
                // TODO: Downgrade range to addition/deletion if past bracket
                if (right_range.type === SuggestionType.SUBSTITUTION && (right_range as SubstitutionRange).contains_separator(from, to)) {
                    const contents = right_range.unwrap_slice(to - right_range.from, Infinity);
                    affixes[1] = create_range(contents, "", ["", ""], right_range.fields, SuggestionType.ADDITION);
                    to = right_range.to;
                } else {
                    affixes[1] = right_range.split_range(to)[1];
                }
            } else {
                to = right_range.from;
            }
        }
    }

    if (type === MarkAction.NONE) {
        return {from, to: from, insert: ""};
    } else if (type === MarkAction.REGULAR) {
        if (left_range !== undefined && left_range === right_range) {
            const contents = from === to ? "" : left_range.unwrap_slice(from - left_range.from, to - left_range.from);
            if (contents) {
                from = left_range.cursor_move_inside(from, true);
                to = left_range.cursor_move_inside(to, false);
                if (left_range.type === SuggestionType.SUBSTITUTION) {
                    const [left_text, right_text] = (left_range as SubstitutionRange).unwrap_slice_parts_inverted(from - left_range.from, to - left_range.from);
                    from = left_range.from;
                    to = left_range.to;
                    inserted = create_suggestion(right_text, left_text + inserted, left_range.fields);
                }
                return {from, to, insert: inserted};
            } else {
                const cursor = left_range.cursor_move_inside(from, true);
                return {from: cursor, to: cursor, insert: inserted}
            }
        } else {
            const contents = from === to ? "" : ranges.unwrap_in_range(text, from, to, in_range.ranges).output;
            if (contents) {
                // TODO: Inserted always marked as regular (should this be the case, is this the user intention?)
                //      Inconsistent with addition behaviour, where it is ALWAYS added into the nearest range
                split_left_range();
                split_right_range();
                return {from, to, insert: affixes[0] + inserted + affixes[1]};
            } else {
                // TODO: Either insert to left range, right range, or in between the ranges, or closest range to cursor
                const range = left_range || right_range;
                const cursor = range ? range.cursor_move_inside(from, true) : from;
                return {from: cursor, to: cursor, insert: inserted}
            }
        }
    } else if (type === MarkAction.CLEAR) {
        split_left_range();
        split_right_range();
        const contents = from === to ? "" : ranges.unwrap_in_range(text, from, to, in_range.ranges).output;
        return {from, to, insert: affixes[0] + contents + affixes[1]};
    } else {
        // NOTE: Special code for handling operations within substitution ranges
        if (left_range !== undefined && left_range === right_range && left_range.type === SuggestionType.SUBSTITUTION) {
            let contents = left_range.unwrap_slice(from - left_range.from, to - left_range.from);
            const right = (left_range as SubstitutionRange).contains_separator(from, to) ? null : from > (left_range as SubstitutionRange).middle + 2;
            const should_split = (right && contents) || (right === false && inserted);
            if (!should_split) {
                if (type === SuggestionType.ADDITION) {
                    from = Math.max(from, (left_range as SubstitutionRange).middle + 2);
                    const parts = left_range.unwrap_parts();
                    const insert_point = from - (left_range as SubstitutionRange).middle - 2;
                    contents = parts[0];
                    inserted = parts[1].slice(0, insert_point) + inserted + parts[1].slice(insert_point);
                } else if (type === SuggestionType.SUBSTITUTION || right === null) {
                    contents = left_range.unwrap_slice(0, to - left_range.from);
                    inserted = inserted + left_range.unwrap_slice(to - left_range.from, Infinity);
                } else {
                    return {from, to: from, insert: ""};
                }
                return {
                    from: left_range.from,
                    to: left_range.to,
                    insert: create_suggestion(inserted, contents, left_range.fields)
                };
            } else {
                let split = "";
                if (!right) {
                    contents = left_range.unwrap_slice(0, to - left_range.from);
                    split = create_suggestion(inserted, contents, left_range.fields);
                    const parts = (left_range as SubstitutionRange).unwrap_slice_parts_inverted(0, to - left_range.from);
                    split += create_suggestion(parts[1], parts[0], left_range.fields);
                } else {
                    const parts = left_range.unwrap_parts();
                    const middle = (left_range as SubstitutionRange).middle + 2;
                    let new_insert = parts[1].slice(0, from - middle);
                    split = create_suggestion(new_insert, parts[0], left_range.fields);
                    const deleted = parts[1].slice(from - middle, to - middle);
                    new_insert = parts[1].slice(to - middle);
                    split += create_suggestion(inserted + new_insert, deleted, left_range.fields);
                }

                return {from: left_range.from, to: left_range.to, insert: split};
            }
        } else {
            let contents = from === to ? "" : ranges.unwrap_in_range(text, from, to, in_range.ranges).output;
            // Might be redundant (especially if operation occurs often)
            if (!contents) {
                if (type === SuggestionType.SUBSTITUTION)
                    type = SuggestionType.ADDITION;
                else if (type === SuggestionType.DELETION)
                    return {from, to: from, insert: ""};
            }
            if (!inserted) {
                if (type === SuggestionType.SUBSTITUTION)
                    type = SuggestionType.DELETION;
                else if (type === SuggestionType.ADDITION)
                    return {from, to: from, insert: ""};
            }

            const left_merge_type = can_merge(from, left_range, type, metadata_fields, true);
            if (left_merge_type) {
                contents = left_range!.unwrap_slice(0, from - left_range!.from) + contents;
                from = left_range!.from;
            } else {
                split_left_range();
            }

            const right_merge_type = can_merge(to, right_range, type, metadata_fields, false);
            if (right_merge_type) {
                if (right_range!.type === SuggestionType.SUBSTITUTION) {
                    const parts = (right_range as SubstitutionRange).unwrap_slice_parts_inverted(from - right_range!.from, to - right_range!.from);
                    inserted = inserted + parts[1];
                    contents += parts[0];
                } else {
                    inserted += right_range!.unwrap_slice(to - right_range!.from, Infinity);
                }
                to = right_range!.to;
            } else {
                split_right_range();
            }

            if (left_merge_type === SuggestionType.SUBSTITUTION || right_merge_type === SuggestionType.SUBSTITUTION)
                type = SuggestionType.SUBSTITUTION;

            return {from, to, insert: create_range(inserted, contents, affixes, metadata_fields, type)};
        }
    }
}

export function mark_ranges(ranges: CriticMarkupRanges, text: Text, from: number, to: number, inserted: string, type: MarkType, metadata_fields?: MetadataFields, force = false): EditorChange[] {

    const in_range = ranges.filter_range(from, to, true);
    const left_range = in_range.ranges.at(0);
    const right_range = in_range.ranges.at(-1);

    if (left_range?.touches_left_bracket(from, true, true, true))
        from = left_range.from;
    if (right_range?.touches_right_bracket(to, true, true))
        to = right_range.to;

    // NOTE: When marking long section as SUBSTITUTION, inserted should only be set for the last range?, all other ranges should be DELETION
    let last_range_start = from;
    const range_operations: EditorChange[] = [];

    if (!force) {
        for (const range of in_range.ranges) {
            // GOAL: Filter out any ranges that may not be marked (for any reason whatsoever)
            // Possible reasons:
            //   1. Incompatible marking type (e.g. you don't want comments to be marked as deletion, no matter what)
            //   2. Metadata difference (author is different)

            if (false) { /* IF INCOMPATIBLE */
                if (last_range_start < range.from) {
                    const edit = mark_range(ranges, text, last_range_start, range.from, "", type, metadata_fields);
                    if (edit) range_operations.push(edit!);
                }
                last_range_start = range.to;
            }
        }
    }
    const edit = mark_range(ranges, text, last_range_start, to, inserted, type, metadata_fields);
    if (edit) range_operations.push(edit);

    return range_operations;
}
