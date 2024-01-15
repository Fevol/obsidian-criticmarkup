// For the reason why I'm re-implementing these keybinds, see index.ts

import { EditorSelection, EditorState, SelectionRange, type StateCommand, Transaction } from '@codemirror/state';
import { type Command, Direction, EditorView } from '@codemirror/view';

type CommandTarget = { state: EditorState, dispatch: (tr: Transaction) => void }


function updateSel(sel: EditorSelection, by: (range: SelectionRange) => SelectionRange) {
	return EditorSelection.create(sel.ranges.map(by), sel.mainIndex)
}

function setSel(state: EditorState, selection: EditorSelection | {anchor: number, head?: number}, forward?: boolean, group?: boolean, select?: boolean, downwards?: boolean) {
	let annotations: any = [];
	if (forward !== undefined) {
		if (downwards !== undefined)
			annotations.push(Transaction.userEvent.of(downwards ? "select.down" : "select.up"))
		else
			annotations.push(Transaction.userEvent.of(forward ? "select.left" : "select.right"))
		annotations.push(Transaction.userEvent.of(forward ? "select.forward" : "select.backward"))
	}
	if (group)
		annotations.push(Transaction.userEvent.of("select.group"))
	if (select)
		annotations.push(Transaction.userEvent.of("select.extend"))
	if (!annotations.length) annotations = undefined;

	return state.update({selection, scrollIntoView: true, userEvent: "select", annotations})
}

function moveSel({state, dispatch}: CommandTarget, how: (range: SelectionRange) => SelectionRange, forward?: boolean, group?: boolean, downwards?: boolean): boolean {
	const selection = updateSel(state.selection, how)
	if (selection.eq(state.selection)) return false
	dispatch(setSel(state, selection, forward, group, undefined, downwards))
	return true
}

function rangeEnd(range: SelectionRange, forward: boolean) {
	return EditorSelection.cursor(forward ? range.to : range.from)
}

function cursorByChar(view: EditorView, forward: boolean) {
	return moveSel(view, range => range.empty ? view.moveByChar(range, forward) : rangeEnd(range, forward), forward)
}

function extendSel(view: EditorView, how: (range: SelectionRange) => SelectionRange, forward?: boolean, group?: boolean, downwards?: boolean): boolean {
	const selection = updateSel(view.state.selection, range => {
		const head = how(range)
		return EditorSelection.range(range.anchor, head.head, head.goalColumn, head.bidiLevel || undefined)
	})
	if (selection.eq(view.state.selection)) return false
	view.dispatch(setSel(view.state, selection, forward, group, true, downwards))
	return true
}

function selectByChar(view: EditorView, forward: boolean) {
	return extendSel(view, range => view.moveByChar(range, forward), forward)
}

function cursorByGroup(view: EditorView, forward: boolean) {
	return moveSel(view, range => range.empty ? view.moveByGroup(range, forward) : rangeEnd(range, forward), forward, true)
}

function selectByGroup(view: EditorView, forward: boolean) {
	return extendSel(view, range => view.moveByGroup(range, forward), forward, true)
}

function ltrAtCursor(view: EditorView) {
	return view.textDirectionAt(view.state.selection.main.head) == Direction.LTR
}

function moveByLineBoundary(view: EditorView, start: SelectionRange, forward: boolean) {
	const line = view.lineBlockAt(start.head)
	let moved = view.moveToLineBoundary(start, forward)
	if (moved.head == start.head && moved.head != (forward ? line.to : line.from))
		moved = view.moveToLineBoundary(start, forward, false)
	if (!forward && moved.head == line.from && line.length) {
		const space = /^\s*/.exec(view.state.sliceDoc(line.from, Math.min(line.from + 100, line.to)))![0].length
		if (space && start.head != line.from + space) moved = EditorSelection.cursor(line.from + space)
	}
	return moved
}

function cursorByLine(view: EditorView, forward: boolean, downwards: boolean) {
	return moveSel(view, range => {
		if (!range.empty) return rangeEnd(range, forward)
		const moved = view.moveVertically(range, forward)
		return moved.head != range.head ? moved : view.moveToLineBoundary(range, forward)
	}, forward, false, downwards)
}

function selectByLine(view: EditorView, forward: boolean, downwards: boolean) {
	return extendSel(view, range => view.moveVertically(range, forward), forward, undefined, downwards)
}

function pageInfo(view: EditorView) {
	const selfScroll = view.scrollDOM.clientHeight < view.scrollDOM.scrollHeight - 2
	let marginTop = 0, marginBottom = 0, height
	if (selfScroll) {
		for (const source of view.state.facet(EditorView.scrollMargins)) {
			const margins = source(view)
			if (margins?.top) marginTop = Math.max(margins?.top, marginTop)
			if (margins?.bottom) marginBottom = Math.max(margins?.bottom, marginBottom)
		}
		height = view.scrollDOM.clientHeight - marginTop - marginBottom
	} else {
		height = (view.dom.ownerDocument.defaultView || window).innerHeight
	}
	return {marginTop, marginBottom, selfScroll,
		height: Math.max(view.defaultLineHeight, height - 5)}
}

function cursorByPage(view: EditorView, forward: boolean, downwards: boolean) {
	const page = pageInfo(view)
	const {state} = view, selection = updateSel(state.selection, range => {
		return range.empty ? view.moveVertically(range, forward, page.height)
			: rangeEnd(range, forward)
	})
	if (selection.eq(state.selection)) return false
	let effect
	if (page.selfScroll) {
		const startPos = view.coordsAtPos(state.selection.main.head)
		const scrollRect = view.scrollDOM.getBoundingClientRect()
		const scrollTop = scrollRect.top + page.marginTop, scrollBottom = scrollRect.bottom - page.marginBottom
		if (startPos && startPos.top > scrollTop && startPos.bottom < scrollBottom)
			effect = EditorView.scrollIntoView(selection.main.head, {y: "start", yMargin: startPos.top - scrollTop})
	}
	view.dispatch(setSel(state, selection, forward, undefined, undefined, downwards), {effects: effect})
	return true
}

function selectByPage(view: EditorView, forward: boolean, downwards: boolean) {
	return extendSel(view, range => view.moveVertically(range, forward, pageInfo(view).height), forward, downwards)
}





export const cursorCharLeft: Command = view => cursorByChar(view, !ltrAtCursor(view))
export const cursorGroupLeft: Command = view => cursorByGroup(view, !ltrAtCursor(view))

export const selectCharLeft: Command = view => selectByChar(view, !ltrAtCursor(view))
export const selectGroupLeft: Command = view => selectByGroup(view, !ltrAtCursor(view))

export const cursorLineUp: Command = view => cursorByLine(view, false, false)
export const selectLineUp: Command = view => selectByLine(view, false, false)

export const cursorLineBoundaryLeft: Command = view => moveSel(view, range => moveByLineBoundary(view, range, !ltrAtCursor(view)), !ltrAtCursor(view))
export const selectLineBoundaryLeft: Command = view => extendSel(view, range => moveByLineBoundary(view, range, !ltrAtCursor(view)), !ltrAtCursor(view))



export const cursorCharRight: Command = view => cursorByChar(view, ltrAtCursor(view))
export const cursorGroupRight: Command = view => cursorByGroup(view, ltrAtCursor(view))

export const selectCharRight: Command = view => selectByChar(view, ltrAtCursor(view))
export const selectGroupRight: Command = view => selectByGroup(view, ltrAtCursor(view))

export const cursorLineDown: Command = view => cursorByLine(view, true, true)
export const selectLineDown: Command = view => selectByLine(view, true, true)

export const cursorLineBoundaryRight: Command = view => moveSel(view, range => moveByLineBoundary(view, range, ltrAtCursor(view)))
export const selectLineBoundaryRight: Command = view => extendSel(view, range => moveByLineBoundary(view, range, ltrAtCursor(view)))


export const selectDocStart: StateCommand = ({state, dispatch}) => {
	dispatch(setSel(state, {anchor: state.selection.main.anchor, head: 0}, false, undefined, undefined, false))
	return true
}

export const selectDocEnd: StateCommand = ({state, dispatch}) => {
	dispatch(setSel(state, {anchor: state.selection.main.anchor, head: state.doc.length}, true, undefined, undefined, true))
	return true
}

export const cursorDocStart: StateCommand = ({state, dispatch}) => {
	dispatch(setSel(state, {anchor: 0}, true, undefined, undefined, false))
	return true
}

export const cursorDocEnd: StateCommand = ({state, dispatch}) => {
	dispatch(setSel(state, {anchor: state.doc.length}, false, undefined, undefined, true))
	return true
}

export const cursorPageUp: Command = view => cursorByPage(view, false, false)
export const cursorPageDown: Command = view => cursorByPage(view, true, true)

export const selectPageUp: Command = view => selectByPage(view, false, false)
export const selectPageDown: Command = view => selectByPage(view, true, true)
