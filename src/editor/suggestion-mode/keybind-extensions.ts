import { Command, EditorView, keymap } from '@codemirror/view';

import {
	CharCategory,
	countColumn,
	EditorSelection,
	EditorState,
	findClusterBreak,
	StateCommand,
} from '@codemirror/state';
import { Transaction } from '@codemirror/state';
import { getIndentUnit } from '@codemirror/language';

// Why this file exists, and why I am redefining the regular 'delete' keybind:
//   When deleting a selection, the 'delete.selection' event is added to the transaction.
//   However, the plugin *needs* to know which direction something was deleted in, so it can
//     determine whether it should place the cursor at the start or end of the deleted text.
//   Thus, the only way to implement this, is to add a custom event to the transaction
//     called 'delete.selection.forward' or 'delete.selection.backward', depending on the direction.

// NOTE: If this ever causes inconsistent behaviour, it might be due to either
//   1. Other plugin overwriting the key: 'Backspace' keybind
//   2. Obsidian changing the keybinds in some way
//   3. CodeMirror update breaking this


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
	// eslint-disable-next-line prefer-const
	let event = 'delete.selection', { state } = target;
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
	let { state } = target, line = state.doc.lineAt(pos), before, targetPos: number;
	if (!forward && pos > line.from && pos < line.from + 200 &&
		!/[^ \t]/.test(before = line.text.slice(0, pos - line.from))) {
		if (before[before.length - 1] == '\t') return pos - 1;
		// @ts-ignore
		let col = countColumn(before, state.tabSize), drop = col % getIndentUnit(state) || getIndentUnit(state);
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

const deleteGroupBackward: StateCommand = target => deleteByGroup(target, false)
/// Delete the selection or forward until the end of the next group.
const deleteGroupForward: StateCommand = target => deleteByGroup(target, true)

/// Delete the selection, or, for cursor selections, the character
/// before the cursor.
const deleteCharBackward: Command = view => deleteByChar(view, false);
/// Delete the selection or the character after the cursor.
const deleteCharForward: Command = view => deleteByChar(view, true);


export const keybindExtensions = keymap.of(([
	{ key: 'Backspace', run: deleteCharBackward, shift: deleteCharBackward },
	{ key: 'Delete', run: deleteCharForward },
	{ key: 'Mod-Backspace', mac: 'Alt-Backspace', run: deleteGroupBackward },
	{ key: 'Mod-Delete', mac: 'Alt-Delete', run: deleteGroupForward },
]));
