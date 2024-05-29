import { EditorSelection, Text } from "@codemirror/state";
import { Editor } from "obsidian";
import { PluginSettings } from "../../../types";
import { EditorSuggestion } from "../edit-handler";
import { MetadataCompatibility, MetadataMergeAction, range_metadata_compatible, rangeParser } from "../edit-util";
import { generate_metadata } from "../edit-util/metadata";
import { construct_range, construct_suggestion } from "../edit-util/range-create";
import {
	CriticMarkupRange,
	CriticMarkupRanges,
	METADATA_TYPE,
	MetadataFields,
	SubstitutionRange,
	SuggestionType,
} from "../ranges";

export enum MarkAction {
	REGULAR = "regular",
	CLEAR = "clear",
	NONE = "none",
}

export type MarkType = SuggestionType | MarkAction;

function range_type_compatible(range: CriticMarkupRange, type: MarkType) {
	if (type === MarkAction.REGULAR || type === MarkAction.CLEAR)
		return true;
	if ((range.type === SuggestionType.COMMENT || range.type === SuggestionType.HIGHLIGHT) && range.type !== type)
		return false;
	return true;
}

function should_ignore_range(
	range: CriticMarkupRange,
	type: MarkType,
	metadata_fields?: MetadataFields,
	metadata_compatibility: MetadataCompatibility = {},
) {
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
		},
	);
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

function mergeable_range(
	cursor: number,
	range?: CriticMarkupRange,
	type?: SuggestionType,
	metadata_fields?: MetadataFields,
	left = false,
	single_range = false,
): {
	type?: SuggestionType;
	merged_metadata?: MetadataFields;
} {
	if (!range || !type || !range_type_compatible(range, type))
		return {};

	// Range cannot be merged if it is already fully included in range
	if (
		!single_range &&
		(left && range.touches_left_bracket(cursor, false, true, true) ||
			!left && range.touches_right_bracket(cursor, false, true))
	) {
		return {};
	}

	const { compatible, merged_metadata } = range_metadata_compatible(range, metadata_fields);
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
	return { type, merged_metadata: type ? merged_metadata : undefined };
}

function mark_range(
	ranges: CriticMarkupRanges,
	text: Text,
	from: number,
	to: number,
	inserted: string,
	type: MarkType,
	metadata_fields?: MetadataFields,
): EditorSuggestion | undefined {
	const in_range = ranges.ranges_in_range(from, to);

	const left_range = ranges.at_cursor(from, false);
	const right_range = ranges.at_cursor(to, true);
	const affixes: [string, string] = ["", ""];
	let special_case = false;

	let insert = inserted;
	let start_offset = 0, end_offset = 0;

	function split_left_range(force = false) {
		if (left_range?.type) {
			if (left_range.touches_left_bracket(from, false, true, true))
				from = left_range.from;
			else if (!left_range.touches_right_bracket(from, false, true)) {
				if (
					left_range.type === SuggestionType.SUBSTITUTION &&
					(force || (left_range as SubstitutionRange).contains_separator(from, to))
				) {
					affixes[0] = construct_range(
						"",
						left_range.unwrap_slice(0, from),
						SuggestionType.DELETION,
						left_range.fields,
					).insert;
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
			if (right_range.touches_right_bracket(to, false, true))
				to = right_range.to;
			else if (!right_range.touches_left_bracket(to, false, true, true)) {
				// TODO: Downgrade range to addition/deletion if past bracket
				if (
					right_range.type === SuggestionType.SUBSTITUTION &&
					(force || (right_range as SubstitutionRange).contains_separator(from, to))
				) {
					const deleted = right_range.unwrap_slice(to, Infinity);
					affixes[1] = construct_range(deleted, "", SuggestionType.ADDITION, right_range.fields).insert;
					to = right_range.to;
					special_case = true;
				} else {
					affixes[1] = right_range.split_range(to)[1];
				}
			} else {
				to = right_range.from;
			}
		}
	}

	if (type === MarkAction.NONE) {
		to = from;
		insert = "";
	} else if (type === MarkAction.REGULAR) {
		if (left_range !== undefined && left_range === right_range) {
			let deleted = from === to ? "" : left_range.unwrap_slice(from, to);
			if (deleted) {
				from = left_range.cursor_move_inside(from, true);
				to = left_range.cursor_move_inside(to, false);

				if (left_range.type === SuggestionType.SUBSTITUTION) {
					const left = (left_range as SubstitutionRange).contains_part(from, to);
					const parts = left_range.unwrap_parts();

					if (left) {
						const l_deleted = left_range.unwrap_slice(0, from);
						start_offset += l_deleted.length;
						// FIXME: -2 hotpatch to not take the separator into account
						end_offset += inserted.length - 2;
						const r_deleted = left_range.unwrap_slice(to, (left_range as SubstitutionRange).middle);
						deleted = l_deleted + inserted + r_deleted;
						insert = parts[1];
					} else if (left === false) {
						deleted = parts[0];
						const l_inserted = left_range.unwrap_slice((left_range as SubstitutionRange).middle + 2, from);
						start_offset = deleted.length + l_inserted.length;
						const r_inserted = left_range.unwrap_slice(to, Infinity);
						insert = l_inserted + inserted + r_inserted;
					} else {
						const [l_deleted, r_inserted] = (left_range as SubstitutionRange).unwrap_slice_parts_inverted(
							from,
							to,
						);
						start_offset = l_deleted.length;
						deleted = l_deleted;
						insert = inserted + r_inserted;
					}
					from = left_range.from;
					to = left_range.to;
					({ insert, start_offset, end_offset } = construct_suggestion(
						insert,
						deleted,
						left_range.fields,
						start_offset,
						end_offset,
					));
				}
			} else {
				const cursor = left_range.cursor_move_inside(from, true);
				from = cursor;
				to = cursor;
				insert = inserted;
			}
		} else {
			const deleted = from === to ? "" : ranges.unwrap_in_range(text, from, to, in_range).output;
			if (deleted) {
				// TODO: Inserted always marked as regular (should this be the case, is this the user intention?)
				//      Inconsistent with addition behaviour, where it is ALWAYS added into the nearest range
				split_left_range();
				split_right_range();
				start_offset += affixes[0].length;
				if (special_case)
					insert = affixes[0] + inserted + affixes[1];
				else {
					end_offset = affixes[1].length;
					insert = affixes[0] + affixes[1] + inserted;
				}
			} else {
				// TODO: Either insert to left range, right range, or in between the ranges, or closest range to cursor
				const range = left_range || right_range;
				const cursor = range ? range.cursor_move_inside(from, true) : from;
				from = cursor;
				to = cursor;
				insert = inserted;
			}
		}
	} else if (type === MarkAction.CLEAR) {
		split_left_range();
		split_right_range();
		const deleted = from === to ? "" : ranges.unwrap_in_range(text, from, to, in_range).output;
		start_offset += affixes[0].length;
		end_offset += deleted.length;
		insert = affixes[0] + deleted + affixes[1];
	} else {
		// NOTE: Special code for handling operations within substitution ranges
		if (left_range !== undefined && left_range === right_range && left_range.type === SuggestionType.SUBSTITUTION) {
			// NOTE: True if edit in left part, False if right, and undefined if the edit covers both parts
			const left = (left_range as SubstitutionRange).contains_part(from, to);
			const cursor = left ? from : to;
			const merge_result = mergeable_range(cursor, left_range, type, metadata_fields, left, true);
			if (!merge_result.type) {
				// CASE 1: Entire substitution should be split (due to incompatible metadata or range type)
				const deleted = left_range.unwrap_slice(from, to);
				split_left_range(to < (left_range as SubstitutionRange).middle);
				split_right_range(from > (left_range as SubstitutionRange).middle + 2);
				({ insert, start_offset, end_offset } = construct_range(
					inserted,
					deleted,
					type,
					metadata_fields,
					start_offset,
					end_offset + inserted.length + deleted.length,
				));
			} else {
				let deleted = "";
				const parts = left_range.unwrap_parts();
				if (merge_result.type === SuggestionType.ADDITION) {
					// CASE 2: Adding to the addition-part (right) of the substitution
					deleted = parts[0];
					const insertion_point = Math.clamp(
						cursor - (left_range as SubstitutionRange).middle - 2,
						0,
						parts[1].length,
					);
					start_offset = parts[0].length + insertion_point;
					insert = parts[1].slice(0, insertion_point) + inserted + parts[1].slice(insertion_point);
					({ insert, start_offset, end_offset } = construct_suggestion(
						insert,
						deleted,
						merge_result.merged_metadata,
						start_offset,
						end_offset,
					));
					from = left_range.from;
					to = left_range.to;
				} else if (merge_result.type === SuggestionType.DELETION) {
					// CASE 3: Deleting in the deletion-part (left) of the substitution
					end_offset = to - from;
					to = from;
					insert = "";
				} else {
					if (left) {
						// CASE 4: Inserting into the deletion-part of the substitution
						const l_delete = left_range.unwrap_slice(0, from);
						const r_delete = left_range.unwrap_slice(from, to);
						split_right_range();
						start_offset = l_delete.length;
						end_offset = r_delete.length;
						({ insert, start_offset, end_offset } = construct_range(
							inserted,
							l_delete + r_delete,
							merge_result.type,
							merge_result.merged_metadata,
							start_offset,
							end_offset,
						));
						from = left_range.from;
					} else if (left === false) {
						// CASE 5: Deleting/Replacing from the addition-part of the substitution
						deleted = left_range.unwrap_slice(from, to);
						end_offset = deleted.length;
						insert = inserted + left_range.unwrap_slice(to, Infinity);
						if (!inserted.length) end_offset -= 2;
						split_left_range();
						({ insert, start_offset, end_offset } = construct_range(
							insert,
							deleted,
							merge_result.type,
							merge_result.merged_metadata,
							start_offset,
							end_offset,
						));
						to = left_range.to;
					} else {
						// CASE 6: Deleting/Replacing from the addition-part of the substitution and inserting to the deletion-part
						const char_middle = Math.clamp(
							to - (left_range as SubstitutionRange).middle - 2,
							0,
							parts[1].length,
						);
						deleted = parts[0] + parts[1].slice(0, char_middle);
						start_offset = from - left_range.range_start;
						end_offset = char_middle + (parts[0].length - from + left_range.range_start);
						insert = inserted + parts[1].slice(char_middle);
						if (insert.length && !inserted.length) end_offset -= 2;
						({ insert, start_offset, end_offset } = construct_suggestion(
							insert,
							deleted,
							merge_result.merged_metadata,
							start_offset,
							end_offset,
						));
						from = left_range.from;
						to = left_range.to;
					}
				}
			}
		} else {
			// NOTE: <OPᶠʳᵒᵐ>░ Lᵃᶠᶠᶦˣ Lᵇʳᵃ (ᵐᵉᵗᵃ) Lᵐᵉʳᵍᵉ ░start░ Lᵈᵉˡ (ˢᵉᵖ) Rᵈᵉˡ Rᵃᵈᵈ ░end░ Rᵐᵉʳᵍᵉ Rᵇʳᵃ Rᵃᶠᶠᶦˣ ░<OPᵗᵒ>
			//       start/end attempt to cheaply calculate the adjusted cursor position after the mark operation
			let deleted = from === to ? "" : ranges.unwrap_in_range(text, from, to, in_range).output;
			if (!deleted) {
				if (type === SuggestionType.SUBSTITUTION)
					type = SuggestionType.ADDITION;
				else if (type === SuggestionType.DELETION)
					return { from, to: from, insert: "", start: from, end: from };
			}
			end_offset = deleted.length;
			// TODO: Downgrade is necessary (due to substitution across multiple ranges)
			//      Marking as addition should always mark all text in range as addition, regardless of whether inserted text is provided
			//      <> Sometimes inserted is empty in substitution (empty clipboard), so it should downgrade to deletion
			// if (!inserted) {
			//     if (type === SuggestionType.SUBSTITUTION)
			//         type = SuggestionType.DELETION;
			//     else if (type === SuggestionType.ADDITION)
			//         return {from, to: from, insert: ""};
			// }

			const left_merge = mergeable_range(from, left_range, type, metadata_fields, true);
			let merged_metadata = left_merge.merged_metadata;

			insert = inserted;
			if (left_merge.type) {
				// NOTE: Required for case of '{~~yyyabc~>123~~}{++zzz++}'
				if (left_range!.type === SuggestionType.SUBSTITUTION) {
					const parts = (left_range as SubstitutionRange).unwrap_parts();
					start_offset = parts[0].length;
					end_offset += parts[1].length;
					deleted = parts[0] + deleted;
					insert = parts[1] + inserted;
				} else {
					const slice = left_range!.unwrap_slice(0, from);
					start_offset = slice.length;
					deleted = slice + deleted;
				}
				from = left_range!.from;
				metadata_fields = merged_metadata;
			} else {
				split_left_range();
			}
			// end_offset = deleted.length;

			const right_merge = mergeable_range(to, right_range, type, metadata_fields, false);
			merged_metadata = right_merge.merged_metadata;
			if (right_merge.type) {
				if (right_range!.type === SuggestionType.SUBSTITUTION) {
					const parts = (right_range as SubstitutionRange).unwrap_slice_parts_inverted(from, to);
					insert = inserted + parts[1];
					deleted += parts[0];
				} else {
					insert += right_range!.unwrap_slice(to, Infinity);
				}
				to = right_range!.to;
				metadata_fields = merged_metadata;
			} else {
				split_right_range();
			}

			if (left_merge.type === SuggestionType.SUBSTITUTION || right_merge.type === SuggestionType.SUBSTITUTION)
				type = SuggestionType.SUBSTITUTION;

			({ insert, start_offset, end_offset } = construct_range(
				insert,
				deleted,
				type,
				metadata_fields,
				start_offset,
				end_offset,
			));
		}
	}
	start_offset += affixes[0].length;
	insert = affixes[0] + insert + affixes[1];
	return { from, to, insert, start: from + start_offset, end: from + start_offset + end_offset + inserted.length };
}

export function mark_ranges(
	ranges: CriticMarkupRanges,
	text: Text,
	from: number,
	to: number,
	inserted: string,
	type: MarkType,
	metadata_fields?: MetadataFields,
	force = false,
): EditorSuggestion[] {
	const in_range = ranges.ranges_in_range(from, to);
	const left_range = in_range.at(0);
	const right_range = in_range.at(-1);

	if (left_range?.touches_left_bracket(from, true, true, true))
		from = left_range.from;
	if (right_range?.touches_right_bracket(to, true, true))
		to = right_range.to;

	// NOTE: When marking long section as SUBSTITUTION, inserted should only be set for the last range?, all other ranges should be DELETION
	let last_range_start = from;
	const range_operations: EditorSuggestion[] = [];

	if (!force) {
		for (const range of in_range) {
			if (should_ignore_range(range, type, metadata_fields)) {
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
	const resulting_selections = [];
	const changes = [];
	for (const selection of selections) {
		const edits = mark_ranges(
			ranges,
			editor.cm.state.doc,
			selection.from,
			selection.to,
			"",
			type,
			generate_metadata(),
		);
		changes.push(...edits);
		resulting_selections.push(EditorSelection.range(edits[0].start, edits[edits.length - 1].end));
	}
	editor.cm.dispatch(editor.cm.state.update({
		changes,
		selection: EditorSelection.create(resulting_selections),
	}));
}
