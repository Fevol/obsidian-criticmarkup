import { ChangeSet, EditorSelection, SelectionRange, Text, Transaction } from '@codemirror/state';

import { type CriticMarkupOperation } from '../edit-operations/types';


export function selectionRangeOverlap(selection: EditorSelection, rangeFrom: number, rangeTo: number) {
	return selection.ranges.some(range => range.from <= rangeTo && range.to >= rangeFrom);
}

export function cursorMoved(tr: Transaction) {
	return tr.startState.selection.ranges[0].from !== tr.selection!.ranges[0].from || tr.startState.selection.ranges[0].to !== tr.selection!.ranges[0].to;
}

export function getEditorRanges(changes: ChangeSet, doc: Text): CriticMarkupOperation[] {
	const changed_ranges: CriticMarkupOperation[] = [];
	changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
		let text = '';
		// @ts-ignore (Inserted always exists when iterating changes)
		if (inserted.text.length === 1 && inserted.text[0] === '')
			text += '';
		else {
			// @ts-ignore (text exists on Text in inserted)
			const change_text = inserted.text.join('');
			text += change_text.length ? change_text : '\n';
		}

		changed_ranges.push({
			from: fromA,
			to: toA,
			offset: {
				removed: toA - fromA,
				added: toB - fromB,
			},
			inserted: text,
			deleted: toA - fromA ? doc.sliceString(fromA, toA) : '',
		});
	});

	return changed_ranges;
}

export function selectionToEditorRange(selection: SelectionRange, text: Text, isDelete = false): CriticMarkupOperation {
	return {
		from: selection.from,
		to: selection.to,
		offset: {
			removed: isDelete ? selection.to - selection.from : 0,
			added: 0,
		},
		inserted: '',
		deleted: isDelete ? text.sliceString(selection.from, selection.to) : '',
	};
}
