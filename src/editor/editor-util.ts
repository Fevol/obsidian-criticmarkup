import type { Editor, EditorPosition } from 'obsidian';

import type { Tree } from '@lezer/common';
import { EditorSelection } from '@codemirror/state';
import type { CriticMarkupNode } from '../types';


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
				if (node.node.nextSibling?.type.name !== 'MSub')
					return;
				nodes.push({
					from: node.from,
					middle: node.node.nextSibling.from,
					to: node.to,
					type: node.type.name,
				});
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

export function nodeAtCursorLocation(nodes: CriticMarkupNode[], pos: number) {
	return nodes.find(node => node.from <= pos && node.to >= pos);
}

export function adjacentNode(nodes: CriticMarkupNode[], pos: number, left: boolean) {
	if (left)
		return nodes.reverse().find(node => node.to <= pos);
	return nodes.find(node => node.from >= pos);
}

export function siblingNode(nodes: CriticMarkupNode[], node: CriticMarkupNode, left: boolean) {
	const index = nodes.indexOf(node);
	if (index === -1)
		return undefined;
	if (left)
		return nodes[index - 1];
	return nodes[index + 1];
}


