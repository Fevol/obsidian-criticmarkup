import {
    CM_All_Brackets,
    CriticMarkupRange,
    CriticMarkupRanges,
    METADATA_TYPE,
    MetadataFields,
    SubstitutionRange,
    SuggestionType
} from "../ranges";
import {Text} from "@codemirror/state";
import {EditorChange} from "../edit-handler";
import {Editor} from "obsidian";
import {rangeParser} from "../edit-util";
import {PluginSettings} from "../../../types";
import {generate_metadata} from "../edit-util/metadata";

export enum MarkAction {
    REGULAR = "regular",
    CLEAR = "clear",
    NONE = "none",
}
export type MarkType = SuggestionType | MarkAction;


export enum MetadataMergeAction {
    // TODO: Check necessity of SKIP action (giving warning for insert in diff-author range could also be handled on SPLIT level)
    // Disable action
    // SKIP = "skip",

    // Split range into two ranges (allow overwriting, does not allow merging)
    SPLIT = "split",
    // Move outside of range (does not allow overwriting, does not allow merging)
    MOVE_OUTSIDE = "move_outside",

    // Choose value of old range
    OLD = "old",
    // Choose value of new range
    NEW = "new",
}

type MetadataCompatibility = {
    [key in METADATA_TYPE]?: MetadataMergeAction;
};

function range_type_compatible(range: CriticMarkupRange, type: MarkType) {
    if (type === MarkAction.REGULAR || type === MarkAction.CLEAR)
        return true;
    if ((range.type === SuggestionType.COMMENT || range.type === SuggestionType.HIGHLIGHT) && range.type !== type)
        return false;
    return true;
}


function should_ignore_range(range: CriticMarkupRange, type: MarkType, metadata_fields?: MetadataFields, metadata_compatibility: MetadataCompatibility = {}) {
    if (!range_type_compatible(range, type))
        return true;
    if (!metadata_fields || !range.fields)
        return false;
    return [...(new Set(Object.keys(metadata_fields).concat(Object.keys(range.fields))))].some(
        (type) => {
            if (metadata_fields[type as METADATA_TYPE] !== range.fields[type as METADATA_TYPE]) {
                if (metadata_compatibility[type as METADATA_TYPE] === MetadataMergeAction.MOVE_OUTSIDE)
                    return true;
                if (type === "author" && range.type === SuggestionType.COMMENT)
                    return true;
            }
            return false;
        }
    );
}


function range_metadata_compatible(range: CriticMarkupRange, metadata_fields?: MetadataFields, metadata_compatibility: MetadataCompatibility = {}) {
    // If no metadata was provided, allow merging of range
    if (!metadata_fields)
        return {compatible: true, merged_metadata: range.fields};

    // If metadata was provided but range has no metadata, do not allow merging
    if (!range.fields)
        return {compatible: false, merged_metadata: undefined};

    const merged_metadata = Object.assign({}, range.fields, metadata_fields);
    for (const type of [...new Set(Object.keys(metadata_fields).concat(Object.keys(range.fields)))]) {
        if (metadata_fields[type] !== range.fields[type]) {
            const action = metadata_compatibility[type as METADATA_TYPE];
            if (MetadataMergeAction.SPLIT === action || MetadataMergeAction.MOVE_OUTSIDE === action)
                    return {compatible: false, merged_metadata: undefined};
            else if (MetadataMergeAction.OLD === action)
                merged_metadata[type as METADATA_TYPE] = range.fields[type];

        }
    }
    return {compatible: true, merged_metadata};
}

const METADATA_INCOMPATIBILITY: MetadataCompatibility = {
    "author": MetadataMergeAction.SPLIT,
}


function merge_type(left: SuggestionType, right: SuggestionType) {
    if (left !== SuggestionType.SUBSTITUTION && left === right)
        return left;
    if (left === SuggestionType.DELETION && right === SuggestionType.ADDITION)
        return SuggestionType.SUBSTITUTION;
    if (left === SuggestionType.SUBSTITUTION && right === SuggestionType.ADDITION)
        return SuggestionType.SUBSTITUTION;
    if (left === SuggestionType.DELETION && right === SuggestionType.SUBSTITUTION)
        return SuggestionType.SUBSTITUTION;
    return undefined;
}

function mergeable_range(cursor: number, range?: CriticMarkupRange, type?: SuggestionType, metadata_fields?: MetadataFields, left = false, single_range = false): {type?: SuggestionType, merged_metadata?: MetadataFields}{
    if (!range || !type || !range_type_compatible(range, type))
        return {};

    // Range cannot be merged if it is already fully included in range
    if (!single_range && (left && range.touches_left_bracket(cursor, false, true, true) || !left && range.touches_right_bracket(cursor, false, true)))
        return {};

    const {compatible, merged_metadata} = range_metadata_compatible(range, metadata_fields, METADATA_INCOMPATIBILITY);
    if (!compatible)
        return {};

    let left_type, right_type;
    if (left) {
        left_type = range.range_type(-Infinity, cursor);
        right_type = type;
    } else {
        left_type = type;
        right_type = range.range_type(cursor, Infinity);
    }
    type = merge_type(left_type, right_type);
    return {type, merged_metadata: type ? merged_metadata : undefined};
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
    const in_range = ranges.ranges_in_range(from, to);

    const left_range = ranges.at_cursor(from, true);
    const right_range = ranges.at_cursor(to, false);
    const affixes: [string, string] = ["", ""];

    function split_left_range(force = false) {
        if (left_range?.type) {
            if (left_range.touches_left_bracket(from, false, true, true)) {
                from = left_range.from;
            } else if (!left_range.touches_right_bracket(from, false, true)) {
                if (left_range.type === SuggestionType.SUBSTITUTION && (force || (left_range as SubstitutionRange).contains_separator(from, to))) {
                    const contents = left_range.unwrap_slice(0, from);
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

    function split_right_range(force = false) {
        if (right_range?.type) {
            if (right_range.touches_right_bracket(to, false, true)) {
                to = right_range.to;
            } else if (!right_range.touches_left_bracket(to, false, true, true)) {
                // TODO: Downgrade range to addition/deletion if past bracket
                if (right_range.type === SuggestionType.SUBSTITUTION && (force || (right_range as SubstitutionRange).contains_separator(from, to))) {
                    const contents = right_range.unwrap_slice(to, Infinity);
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
    }

    else if (type === MarkAction.REGULAR) {
        if (left_range !== undefined && left_range === right_range) {
            const contents = from === to ? "" : left_range.unwrap_slice(from, to);
            if (contents) {
                from = left_range.cursor_move_inside(from, true);
                to = left_range.cursor_move_inside(to, false);
                if (left_range.type === SuggestionType.SUBSTITUTION) {
                    const [left_text, right_text] = (left_range as SubstitutionRange).unwrap_slice_parts_inverted(from, to);
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
            const contents = from === to ? "" : ranges.unwrap_in_range(text, from, to, in_range).output;
            if (contents) {
                // TODO: Inserted always marked as regular (should this be the case, is this the user intention?)
                //      Inconsistent with addition behaviour, where it is ALWAYS added into the nearest range
                split_left_range();
                split_right_range();
                // return {from, to, insert: affixes[0] + inserted + affixes[1]};
                return {from, to, insert: affixes[0] + affixes[1] + inserted};
            } else {
                // TODO: Either insert to left range, right range, or in between the ranges, or closest range to cursor
                const range = left_range || right_range;
                const cursor = range ? range.cursor_move_inside(from, true) : from;
                return {from: cursor, to: cursor, insert: inserted}
            }
        }
    }

    else if (type === MarkAction.CLEAR) {
        split_left_range();
        split_right_range();
        const contents = from === to ? "" : ranges.unwrap_in_range(text, from, to, in_range).output;
        return {from, to, insert: affixes[0] + contents + affixes[1]};
    }

    else {
        // NOTE: Special code for handling operations within substitution ranges
        if (left_range !== undefined && left_range === right_range && left_range.type === SuggestionType.SUBSTITUTION) {
            const left = to < (left_range as SubstitutionRange).middle ? true : from > (left_range as SubstitutionRange).middle + 2 ? false : undefined;
            const cursor = left ? from : to;
            const merge_result = mergeable_range(cursor, left_range, type, metadata_fields, left, true);
            if (!merge_result.type) {
                const contents = left_range.unwrap_slice(from, to);
                split_left_range(to < (left_range as SubstitutionRange).middle);
                split_right_range(from > (left_range as SubstitutionRange).middle + 2);
                return {from, to, insert: create_range(inserted, contents, affixes, metadata_fields, type)};
            } else {
                let contents = "";
                const parts = left_range.unwrap_parts();
                if (merge_result.type === SuggestionType.ADDITION) {
                    contents = parts[0];
                    inserted = parts[1].slice(0, cursor - (left_range as SubstitutionRange).middle - 2) + inserted + parts[1].slice(cursor - (left_range as SubstitutionRange).middle - 2);
                } else if (merge_result.type === SuggestionType.DELETION) {
                    return {from, to: from, insert: ""};
                } else {
                    if (left) {
                        // contents = parts[0].slice(0, to - (left_range as SubstitutionRange).range_front - 3);
                        // inserted = create_suggestion(inserted, contents, merge_result.merged_metadata);
                        // contents = parts[0].slice(to - (left_range as SubstitutionRange).range_front - 3);
                        // inserted += create_suggestion(parts[1], contents, merge_result.merged_metadata);
                        // return {from: left_range.from, to: left_range.to, insert: inserted};

                        const contents = left_range.unwrap_slice(0, to);
                        split_right_range();
                        return {from: left_range.from, to, insert: create_range(inserted, contents, affixes, merge_result.merged_metadata, merge_result.type)};
                    } else if (left === false) {
                        inserted = inserted + left_range.unwrap_slice(to, Infinity);
                        contents = left_range.unwrap_slice(from, to);
                        split_left_range();
                        return {from, to: left_range.to, insert: create_range(inserted, contents, affixes, merge_result.merged_metadata, merge_result.type)};
                    } else {
                        const char_middle = to - (left_range as SubstitutionRange).middle - 2;
                        contents = parts[0] + parts[1].slice(0, char_middle);
                        inserted = inserted + parts[1].slice(char_middle)
                    }
                }
                return {from: left_range.from, to: left_range.to, insert: create_suggestion(inserted, contents, merge_result.merged_metadata)};
            }
        } else {
            let contents = from === to ? "" : ranges.unwrap_in_range(text, from, to, in_range).output;
            if (!contents) {
                if (type === SuggestionType.SUBSTITUTION)
                    type = SuggestionType.ADDITION;
                else if (type === SuggestionType.DELETION)
                    return {from, to: from, insert: ""};
            }
            // TODO: Downgrade is necessary (due to substitution across multiple ranges)
            //      Marking as addition should always mark all text in range as addition, regardless of whether inserted text is provided
            //      <> Sometimes inserted is empty in substitution (empty clipboard), so it should downgrade to deletion
            // if (!inserted) {
            //     if (type === SuggestionType.SUBSTITUTION)
            //         type = SuggestionType.DELETION;
            //     else if (type === SuggestionType.ADDITION)
            //         return {from, to: from, insert: ""};
            // }

            let left_merge_type, right_merge_type, merged_metadata;
            ({type: left_merge_type, merged_metadata} = mergeable_range(from, left_range, type, metadata_fields, true));
            if (left_merge_type) {
                if (left_range!.type === SuggestionType.SUBSTITUTION) {
                    const parts = (left_range as SubstitutionRange).unwrap_parts();
                    contents = parts[0] + contents;
                    inserted = parts[1] + inserted;
                } else {
                    contents = left_range!.unwrap_slice(0, from) + contents;
                }
                from = left_range!.from;
                metadata_fields = merged_metadata;
            } else {
                split_left_range();
            }

            ({type: right_merge_type, merged_metadata} = mergeable_range(to, right_range, type, metadata_fields, false));
            if (right_merge_type) {
                if (right_range!.type === SuggestionType.SUBSTITUTION) {
                    // TODO Check if left-merge stuff for subs should be used too
                    const parts = (right_range as SubstitutionRange).unwrap_slice_parts_inverted(from, to);
                    inserted = inserted + parts[1];
                    contents += parts[0];
                } else {
                    inserted += right_range!.unwrap_slice(to, Infinity);
                }
                to = right_range!.to;
                metadata_fields = merged_metadata;
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
    const in_range = ranges.ranges_in_range(from, to);
    const left_range = in_range.at(0);
    const right_range = in_range.at(-1);

    if (left_range?.touches_left_bracket(from, true, true, true))
        from = left_range.from;
    if (right_range?.touches_right_bracket(to, true, true))
        to = right_range.to;

    // NOTE: When marking long section as SUBSTITUTION, inserted should only be set for the last range?, all other ranges should be DELETION
    let last_range_start = from;
    const range_operations: EditorChange[] = [];

    if (!force) {
        for (const range of in_range) {
            if (should_ignore_range(range, type, metadata_fields, METADATA_INCOMPATIBILITY)) {
                if (last_range_start < range.from) {
                    const adj_type = type === SuggestionType.SUBSTITUTION ? SuggestionType.DELETION : type;
                    const edit = mark_range(ranges, text, last_range_start, range.from, "", adj_type, metadata_fields);
                    if (edit) range_operations.push(edit!);
                }
                last_range_start = range.to;
            }
        }
    }
    if (last_range_start > to)
        to = last_range_start;

    const edit = mark_range(ranges, text, last_range_start, to, inserted, type, metadata_fields);
    if (edit) range_operations.push(edit);

    return range_operations;
}


export function mark_editor_ranges(editor: Editor, type: MarkType, settings: PluginSettings) {
    const ranges = editor.cm.state.field(rangeParser).ranges;

    const selections = editor.cm.state.selection.ranges;
    for (const selection of selections) {
        editor.cm.dispatch(editor.cm.state.update({
            changes: mark_ranges(ranges, editor.cm.state.doc, selection.from, selection.to, "", type, generate_metadata(settings)),
        }));
    }
}
