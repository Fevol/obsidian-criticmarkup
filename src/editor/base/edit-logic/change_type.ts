import { type ChangeSpec, EditorSelection, SelectionRange, Text } from '@codemirror/state';

import { type Editor, type MarkdownView } from 'obsidian';

import { SuggestionType, CriticMarkupRanges, CM_All_Brackets } from '../ranges';
import { rangeParser, selectionToEditorRange } from '../edit-util';
import { text_delete, text_replace, type OperationReturn } from '../edit-operations';

export function changeSelectionType(text: Text, selection: SelectionRange, type: SuggestionType, ranges: CriticMarkupRanges, offset: number): OperationReturn {
	let selection_start = selection.from, selection_end = selection.to;
	const ranges_in_range = ranges.ranges_in_range(selection_start, selection_end);
	const unwrapped_text = ranges.unwrap_in_range(text, selection_start, selection_end, ranges_in_range);

	selection_start = unwrapped_text.from;
	selection_end = unwrapped_text.to;

	let start_offset = 0, end_offset = 0;


	let output_text = '';
	if (unwrapped_text.front_range) {
		if (unwrapped_text.front_range.type !== type) {
			output_text += CM_All_Brackets[unwrapped_text.front_range.type].at(-1);
			start_offset += 3;
			output_text += CM_All_Brackets[type].at(0);
		}
	} else {
		output_text += CM_All_Brackets[type].at(0);
	}
	output_text += unwrapped_text.output;


	if (unwrapped_text.back_range) {
		if (unwrapped_text.back_range.type !== type) {
			output_text += CM_All_Brackets[type].at(-1);
			end_offset -= 3;
			output_text += CM_All_Brackets[unwrapped_text.back_range.type].at(0);
		}
	} else {
		output_text += CM_All_Brackets[type].at(-1);
	}

	end_offset += output_text.length - (selection.to - selection.from);

	return {
		changes: [{
			from: selection_start,
			to: selection_end,
			insert: output_text,
		}],
		selection: EditorSelection.range(selection_start + start_offset + offset, selection_end + end_offset + offset),
		offset: output_text.length - (selection.to - selection.from),
	};
}


export function changeType(editor: Editor, view: MarkdownView, type: SuggestionType) {
	const ranges = editor.cm.state.field(rangeParser).ranges;
	const text = editor.cm.state.doc;
	const editor_changes: ChangeSpec[] = [], selections: SelectionRange[] = [];


	let fn: (text: Text, sel: SelectionRange, type: SuggestionType, ranges: CriticMarkupRanges) => OperationReturn;
	let current_offset = 0;

	if (type === SuggestionType.DELETION) {
		fn = (text, sel, type, ranges) => {
			return text_delete(
				selectionToEditorRange(sel, text, true),
				ranges, current_offset, text, false, false,
				true, editor.cm.state, true,
			);
		};
	} else if (type === SuggestionType.SUBSTITUTION) {
		fn = (text, sel, type, ranges) => {
			return text_replace(
				selectionToEditorRange(sel, text, true),
				ranges, current_offset, text,
			);
		};
	} else {
		fn = (text, sel, type, ranges) => {
			return changeSelectionType(text, sel, type, ranges, current_offset);
		};
	}

	for (const sel of editor.cm.state.selection.ranges) {
		const { changes, selection, offset } = fn(text, sel, type, ranges);
		editor_changes.push(...changes);
		selections.push(selection);
		current_offset = offset;
	}

	editor.cm.dispatch(editor.cm.state.update({
		changes: editor_changes,
		selection: EditorSelection.create(selections),
	}));
}
