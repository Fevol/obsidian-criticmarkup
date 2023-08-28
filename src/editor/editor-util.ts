import type { Editor, EditorPosition } from 'obsidian';

import type { Tree } from '@lezer/common';
import {
	ChangeSet,
	CharCategory,
	EditorSelection,
	EditorState,
	findClusterBreak,
	Transaction,
	Text, SelectionRange,
} from '@codemirror/state';
import { constructNode, CriticMarkupNode, CriticMarkupNodes } from './criticmarkup-nodes';
import { type CriticMarkupOperation } from '../types';


export function eqEP(a: EditorPosition, b: EditorPosition): boolean {
	return a.line === b.line && a.ch === b.ch;
}

export function ltEP(a: EditorPosition, b: EditorPosition): boolean {
	if (a.line !== b.line)
		return a.line < b.line;
	return a.ch < b.ch;
}

export function lteEP(a: EditorPosition, b: EditorPosition): boolean {
	if (a === b)
		return true;
	return ltEP(a, b);
}

export function minEP(a: EditorPosition, b: EditorPosition): EditorPosition {
	return ltEP(a, b) ? a : b;
}

export function maxEP(a: EditorPosition, b: EditorPosition): EditorPosition {
	return ltEP(a, b) ? b : a;
}

export function moveEditorCursor(selection: EditorSelection, change_start: number, offset: number) {
	if (change_start >= selection.ranges[0].from)
		return selection;
	return EditorSelection.range(
		selection.ranges[0].from + offset,
		selection.ranges[0].to + offset,
	);
}


export function selectionToRange(editor: Editor): number[] {
	const selection = editor.listSelections()[0];
	return [
		editor.posToOffset(minEP(selection.anchor, selection.head)),
		editor.posToOffset(maxEP(selection.anchor, selection.head)),
	];
}


export function selectionRangeOverlap(selection: EditorSelection, rangeFrom: number, rangeTo: number) {
	return selection.ranges.some(range => range.from <= rangeTo && range.to >= rangeFrom);
}


export function nodeAtCursor(tree: Tree, pos: number) {
	const node = tree.resolve(pos, -1);
	if (node.type.name === '⚠' || node.type.name === 'CriticMarkup')
		return undefined;
	if (node.type.name === 'MSub')
		return node.parent;
	return node;
}


export function nodesInSelection(tree: Tree, start?: number, end?: number) {
	const nodes: CriticMarkupNode[] = [];

	tree.iterate({
		from: start,
		to: end,
		enter: (node) => {
			// FIXME: Add check here whether [node.to - 3, node.to] is in fact a bracket, prevent half-open nodes from actually being considered as nodes
			if (node.type.name === '⚠')
				return false;
			if (node.type.name === 'CriticMarkup' || node.type.name === 'MSub')
				return;
			if (node.type.name === 'Substitution') {
				if (node.node.firstChild?.type.name !== 'MSub')
					return;
				nodes.push(constructNode(node.from, node.to, node.type.name, node.node.firstChild?.from)!);
			} else {
				nodes.push(constructNode(node.from, node.to, node.type.name, node.node.firstChild?.from)!);
			}
		},
	});
	return new CriticMarkupNodes(nodes);
}



export function findBlockingChar(start: number, forward: boolean, state: EditorState, ignore_initial_space = false, cat: CharCategory | null = null): [number, number | null] {
	let pos = start;
	const line = state.doc.lineAt(pos);
	// 0: Word		1: Space		2: Other
	const categorize = state.charCategorizer(pos)
	if (cat === CharCategory.Space) cat = null;

	let nextCat = null
	for (cat;;) {
		if (pos == (forward ? line.to : line.from)) {
			if (pos == start && line.number != (forward ? state.doc.lines : 1))
				pos += forward ? 1 : -1
			break
		}
		const next = findClusterBreak(line.text, pos - line.from, forward) + line.from
		const nextChar = line.text.slice(Math.min(pos, next) - line.from, Math.max(pos, next) - line.from)
		nextCat = categorize(nextChar)
		if (cat != null && nextCat != cat) {
			if (cat == 1 && ignore_initial_space) ignore_initial_space = false
			else break
		}
		if (nextChar != " " || pos != start) cat = nextCat
		pos = next
	}
	return [pos, cat]
}

export function isBlockingChar(pos: number, state: EditorState) {
	return !getCharCategory(pos, state);
}

export function getCharCategory(pos: number, state: EditorState, left: boolean = false) {
	const line = state.doc.lineAt(pos);
	const categorize = state.charCategorizer(pos)

	if (left)
		pos -= 1;

	// Categorize character at pos, if categorize(char) === 0, then it is not a blocking character
	return categorize(line.text.slice(pos - line.from, pos - line.from + 1));
}


export function getUserEvents(tr: Transaction) {
	//@ts-ignore (Transaction has annotations)
	return tr.annotations.map(x => x.value).filter(x => typeof x === 'string');
}

export function cursorMoved(tr: Transaction) {
	return tr.startState.selection.ranges[0].from !== tr.selection!.ranges[0].from || tr.startState.selection.ranges[0].to !== tr.selection!.ranges[0].to;
}

export function cursorMovedForward(tr: Transaction) {
	return tr.startState.selection.ranges[0].from !== tr.selection!.ranges[0].from ?
		tr.startState.selection.ranges[0].from > tr.selection!.ranges[0].from :
		tr.startState.selection.ranges[0].to > tr.selection!.ranges[0].to;
}

export function cursorIsSelection(tr: Transaction) {
	return tr.selection!.ranges[0].from !== tr.selection!.ranges[0].to;
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
