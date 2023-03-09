import type { EditorPosition } from 'obsidian';
import type { Tree } from '@lezer/common';
import { EditorSelection } from '@codemirror/state';
import type { Editor } from 'obsidian';


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
		return undefined
	if (node.type.name === 'MSub')
		return node.parent;
	return node;
}

export function moveEditorCursor(selection: EditorSelection, change_start: number, offset: number) {
	if (change_start >= selection.ranges[0].from)
		return selection;
	return EditorSelection.range(
		selection.ranges[0].from + offset,
		selection.ranges[0].to + offset,
	)
}


export function nodesInSelection(tree: Tree, start?: number, end?: number) {
	const nodes: { from: number, middle?: number, to: number, type: string }[] = [];

	tree.iterate({
		from: start,
		to: end,
		enter: (node) => {
			if (node.type.name === '⚠')
				return false;
			if (node.type.name === 'CriticMarkup' || node.type.name === 'MSub')
				return;
			if (node.type.name === 'Substitution') {
				if (node.node.nextSibling?.type.name !== 'MSub')
					return;
				nodes.push({
					from: node.from,
					middle: node.node.nextSibling.from,
					to: node.to,
					type: node.type.name,
				})
			} else {
				nodes.push({
					from: node.from,
					to: node.to,
					type: node.type.name,
				});
			}
		},
	});
	return nodes;
}

export function objectDifference(new_obj: any, old_obj: any): Partial<typeof new_obj> {
	const diff: Partial<typeof new_obj> = {};
	for (const key in new_obj) {
		if (new_obj[key] !== old_obj[key])
			diff[key] = new_obj[key];
	}
	return diff;
}


// function nodesInText(tree: Tree) {
// 	const nodes: { from: number, middle?: number, to: number, type: string }[] = [];
//
// 	const cursor = tree.cursor();
// 	while (cursor.next()) {
// 		const start = cursor.from;
// 		const end = cursor.to;
// 		const name = cursor.name;
//
// 		// If error detected: return only the confirmed nodes (errored node will always contain all text after it, invalid)
// 		if (name === '⚠')
// 			return nodes.slice(0, -1);
//
// 		if (name === 'Substitution') {
// 			cursor.firstChild();
// 			if (cursor.name !== 'MSub') continue;
//
// 			nodes.push({
// 				from: start,
// 				middle: cursor.from,
// 				to: end,
// 				type: name,
// 			});
// 		} else {
// 			nodes.push({
// 				from: start,
// 				to: end,
// 				type: name,
// 			});
// 		}
// 	}
// 	return nodes;
// }