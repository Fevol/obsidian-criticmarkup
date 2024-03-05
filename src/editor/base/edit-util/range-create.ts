import {CM_All_Brackets, MetadataFields, SuggestionType} from "../ranges";
import {generate_metadata} from "./metadata";

export function construct_suggestion(inserted: string, deleted: string, metadata_fields?: MetadataFields, start_offset = 0, end_offset = 0) {
    return construct_range(inserted, deleted, inserted && deleted ? SuggestionType.SUBSTITUTION : (inserted ? SuggestionType.ADDITION : SuggestionType.DELETION),
        metadata_fields, start_offset, end_offset);
}

export function construct_range(inserted: string, deleted: string, type: SuggestionType, metadata_fields?: MetadataFields, start_offset = 0, end_offset = 0) {
    if (!type)
        return {insert: deleted + inserted, start_offset, end_offset};

    const brackets = CM_All_Brackets[type];
    const metadata = metadata_fields && Object.keys(metadata_fields).length ? JSON.stringify(metadata_fields) + "@@" : "";
    const output = brackets[0] + metadata +
        (type === SuggestionType.SUBSTITUTION ? deleted + brackets[1] + inserted + brackets[2]
            : deleted + inserted + brackets[1]);
    const initial_offset = brackets[0].length + metadata.length;
    start_offset += initial_offset;
    // FIXME: end may not be offset if the bracket appears after the end
    end_offset += (type === SuggestionType.SUBSTITUTION ? brackets[1].length : 0);

    return {insert: output, start_offset, end_offset};
}

export function create_range(type: SuggestionType, inserted: string, deleted: string = "") {
    return construct_range(inserted, deleted, type, generate_metadata()).insert;
}
