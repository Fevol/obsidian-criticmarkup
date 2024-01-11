import { Transaction } from '@codemirror/state';

import { getEditorRanges } from './selection-logic';
import { CriticMarkupRange, CriticMarkupRanges } from '../ranges';


function compareChanges(previous: CriticMarkupRanges, current: CriticMarkupRanges, tr: Transaction): {
	removed: CriticMarkupRange[], added: CriticMarkupRange[]
} {
	const removed: CriticMarkupRange[] = [];
	const added: CriticMarkupRange[] = [];

	const changes = getEditorRanges(tr.changes, tr.startState.doc);
	let offset = 0;

	for (const change of changes) {
		const current_offset = change.offset.added - change.offset.removed;
		const ranges_affected = previous.ranges_in_range(change.from, change.to);
		const new_ranges = current.ranges_in_range(change.from + offset, change.to + current_offset + offset);

		if (ranges_affected.length)
			removed.push(...ranges_affected);
		if (new_ranges.length)
			added.push(...new_ranges);

		offset += current_offset;
	}

	return { removed, added };
}

export function applyToText(text: string, fn: (range: CriticMarkupRange, text: string) => string, ranges: CriticMarkupRange[]) {
	let output = '';
	let last_range = 0;
	for (const range of ranges) {
		output += text.slice(last_range, range.from) + fn(range, text);
		last_range = range.to;
	}
	return output + text.slice(last_range);
}
