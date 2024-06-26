import { ChangeSet, EditorSelection, SelectionRange, Text, Transaction } from "@codemirror/state";

import { type EditorEditChange, type EditorOffsetChange } from "../edit-handler";

export function isCursor(selection: EditorSelection) {
	return selection.ranges.length === 1 && selection.ranges[0].anchor === selection.ranges[0].head;
}

export function selectionRangeOverlap(selection: EditorSelection, rangeFrom: number, rangeTo: number) {
	return selection.ranges.some(range => range.from <= rangeTo && range.to >= rangeFrom);
}

export function cursorMoved(tr: Transaction) {
	return tr.startState.selection.ranges[0].from !== tr.selection!.ranges[0].from ||
		tr.startState.selection.ranges[0].to !== tr.selection!.ranges[0].to;
}

export function getEditorOffsets(changes: ChangeSet): EditorOffsetChange[] {
	const changed_ranges: EditorOffsetChange[] = [];
	changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
		changed_ranges.push({
			from: fromA,
			to: toA,
			offset: {
				removed: toA - fromA,
				added: toB - fromB,
			},
		});
	});

	return changed_ranges;
}

export function getEditorRanges(selection: EditorSelection, changes: ChangeSet, doc: Text): EditorEditChange[] {
	const changed_ranges: EditorEditChange[] = [];
	let i = 0;
	changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
		changed_ranges.push({
			from: fromA,
			to: toA,
			anchor: selection.ranges[i].anchor,
			offset: {
				removed: toA - fromA,
				added: toB - fromB,
			},
			inserted: inserted.toString(),
			deleted: toA - fromA ? doc.sliceString(fromA, toA) : "",
			selection: selection.ranges[i].anchor !== selection.ranges[i].head,
		});

		// All user-edits map changes one-to-one with selections, commands can have multiple selections per change
		// TODO: Check implications
		if (i < selection.ranges.length - 1)
			i++;
	});

	return changed_ranges;
}

export function selectionToEditorRange(selection: SelectionRange, text: Text, isDelete = false): EditorEditChange {
	return {
		from: selection.from,
		to: selection.to,
		offset: {
			removed: isDelete ? selection.to - selection.from : 0,
			added: 0,
		},
		inserted: "",
		deleted: isDelete ? text.sliceString(selection.from, selection.to) : "",
	};
}
