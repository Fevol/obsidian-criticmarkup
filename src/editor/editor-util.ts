import type { Editor, EditorPosition } from 'obsidian';

import type { Tree } from '@lezer/common';
import { CharCategory, EditorSelection, EditorState, findClusterBreak, Transaction } from '@codemirror/state';
import { CriticMarkupNode, CriticMarkupNodes } from './criticmarkup-nodes';
import { constructNode } from './criticmarkup-nodes';


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



export function deleteGroup(start: number, forward: boolean, state: EditorState) {
	let pos = start;
	const line = state.doc.lineAt(pos);
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
}



export function getUserEvents(tr: Transaction) {
	//@ts-ignore (Transaction has annotations)
	return tr.annotations.map(x => x.value).filter(x => typeof x === 'string');
}
