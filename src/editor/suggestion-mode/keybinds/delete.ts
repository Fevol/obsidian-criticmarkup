// For the reason why I'm re-implementing these keybinds, see index.ts

import { Command, EditorView } from '@codemirror/view';
import {
	CharCategory,
	countColumn,
	EditorSelection, EditorState,
	findClusterBreak,
	StateCommand,
	Transaction,
} from '@codemirror/state';
import { getIndentUnit } from '@codemirror/language';

type CommandTarget = { state: EditorState, dispatch: (tr: Transaction) => void }

function skipAtomic(target: CommandTarget, pos: number, forward: boolean) {
	if (target instanceof EditorView) for (const ranges of target.state.facet(EditorView.atomicRanges).map(f => f(target)))
		ranges.between(pos, pos, (from, to) => {
			if (from < pos && to > pos) pos = forward ? to : from;
		});
	return pos;
}

function deleteBy(target: CommandTarget, by: (start: number) => number, forward?: boolean, group?: boolean) {
	if (target.state.readOnly) return false;
	let event = 'delete.selection';
	const { state } = target;
	const changes = state.changeByRange(range => {
		let { from, to } = range;
		if (from == to) {
			let towards = by(from);
			if (towards < from) {
				event = 'delete.backward';
				towards = skipAtomic(target, towards, false);
			} else if (towards > from) {
				event = 'delete.forward';
				towards = skipAtomic(target, towards, true);
			}
			from = Math.min(from, towards);
			to = Math.max(to, towards);
		} else {
			from = skipAtomic(target, from, false);
			to = skipAtomic(target, to, true);
		}
		return from == to ? { range } : { changes: { from, to }, range: EditorSelection.cursor(from) };
	});
	if (changes.changes.empty) return false;

	const annotations = [];
	if (forward !== undefined && event === 'delete.selection')
		annotations.push(Transaction.userEvent.of((forward ? 'delete.selection.forward' : 'delete.selection.backward')));
	if (group)
		annotations.push(Transaction.userEvent.of('delete.group'));

	target.dispatch(state.update(changes, {
		scrollIntoView: true,
		userEvent: event,
		annotations: annotations,
		effects: event == 'delete.selection' ? EditorView.announce.of(state.phrase('Selection deleted')) : undefined,
	}));
	return true;
}

const deleteByChar = (target: CommandTarget, forward: boolean) => deleteBy(target, pos => {
	const { state } = target, line = state.doc.lineAt(pos);
	let before, targetPos: number;
	if (!forward && pos > line.from && pos < line.from + 200 &&
		!/[^ \t]/.test(before = line.text.slice(0, pos - line.from))) {
		if (before[before.length - 1] == '\t') return pos - 1;
		// @ts-ignore
		const col = countColumn(before, state.tabSize), drop = col % getIndentUnit(state) || getIndentUnit(state);
		for (let i = 0; i < drop && before[before.length - 1 - i] == " "; i++) pos--;
		targetPos = pos;
	} else {
		targetPos = findClusterBreak(line.text, pos - line.from, forward, forward) + line.from;
		if (targetPos == pos && line.number != (forward ? state.doc.lines : 1))
			targetPos += forward ? 1 : -1;
	}
	return targetPos;
}, forward);


const deleteByGroup = (target: CommandTarget, forward: boolean) => deleteBy(target, start => {
	// eslint-disable-next-line prefer-const
	let pos = start, {state} = target, line = state.doc.lineAt(pos)
	const categorize = state.charCategorizer(pos)
	for (let cat: CharCategory | null = null;;) {
		if (pos == (forward ? line.to : line.from)) {
			if (pos == start && line.number != (forward ? state.doc.lines : 1))
				pos += forward ? 1 : -1
			break
		}
		const next = findClusterBreak(line.text, pos - line.from, forward) + line.from
		const nextChar = line.text.slice(Math.min(pos, next) - line.from, Math.max(pos, next) - line.from)
		const nextCat = categorize(nextChar)
		if (cat != null && nextCat != cat) break
		if (nextChar != " " || pos != start) cat = nextCat
		pos = next
	}
	return pos
}, forward, true)

export const deleteGroupBackward: StateCommand = target => deleteByGroup(target, false)
/// Delete the selection or forward until the end of the next group.
export const deleteGroupForward: StateCommand = target => deleteByGroup(target, true)

/// Delete the selection, or, for cursor selections, the character
/// before the cursor.
export const deleteCharBackward: Command = view => deleteByChar(view, false);
/// Delete the selection or the character after the cursor.
export const deleteCharForward: Command = view => deleteByChar(view, true);
