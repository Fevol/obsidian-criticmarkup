import { CharCategory, EditorState, findClusterBreak } from '@codemirror/state';

export function findBlockingChar(start: number, forward: boolean, state: EditorState, ignore_initial_space = false, cat: CharCategory | null = null): [number, number | null] {
	let pos = start;
	const line = state.doc.lineAt(pos);
	// 0: Word		1: Space		2: Other
	const categorize = state.charCategorizer(pos);
	if (cat === CharCategory.Space) cat = null;

	let nextCat = null;
	for (cat; ;) {
		if (pos == (forward ? line.to : line.from)) {
			if (pos == start && line.number != (forward ? state.doc.lines : 1))
				pos += forward ? 1 : -1;
			break;
		}
		const next = findClusterBreak(line.text, pos - line.from, forward) + line.from;
		const nextChar = line.text.slice(Math.min(pos, next) - line.from, Math.max(pos, next) - line.from);
		nextCat = categorize(nextChar);
		if (cat != null && nextCat != cat) {
			if (cat == 1 && ignore_initial_space) ignore_initial_space = false;
			else break;
		}
		if (nextChar != ' ' || pos != start) cat = nextCat;
		pos = next;
	}
	return [pos, cat];
}

export function isBlockingChar(pos: number, state: EditorState) {
	return !getCharCategory(pos, state);
}

export function getCharCategory(pos: number, state: EditorState, left: boolean = false) {
	const line = state.doc.lineAt(pos);
	const categorize = state.charCategorizer(pos);

	if (left)
		pos -= 1;

	// Categorize character at pos, if categorize(char) === 0, then it is not a blocking character
	return categorize(line.text.slice(pos - line.from, pos - line.from + 1));
}
