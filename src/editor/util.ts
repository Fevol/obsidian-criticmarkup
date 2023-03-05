import type { EditorPosition } from 'obsidian';

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