import { Decoration, DecorationSet, EditorView, PluginValue, ViewPlugin, ViewUpdate } from '@codemirror/view';
import type { EditorSelection, Range } from '@codemirror/state';
import type { Tree } from '@lezer/common';

import { criticmarkupLanguage } from './parser';
import { TreeFragment } from '@lezer/common';

function selectionRangeOverlap(selection: EditorSelection, rangeFrom: number, rangeTo: number) {
	return selection.ranges.some(range => range.from <= rangeTo && range.to >= rangeFrom);
}

class CriticMarkupViewPlugin implements PluginValue {
	decorations: DecorationSet;
	tree: Tree;
	fragments: TreeFragment[] = [];

	constructor(view: EditorView) {
		// @ts-ignore
		this.tree = criticmarkupLanguage.parser.parse(view.state.doc.toString());
		// @ts-ignore
		this.fragments = TreeFragment.addTree(this.tree);

		this.decorations = this.buildDecorations(view) ?? Decoration.none;
	}

	buildDecorations(view: EditorView): DecorationSet {
		const widgets: Range<Decoration>[] = [];
		const selection = view.state.selection;

		const cursor = this.tree.cursor();
		while (cursor.next()) {
			const start = cursor.from;
			const end = cursor.to;
			const name = cursor.name;

			if (name === '⚠' || name === 'MSub') continue;

			// Get next cursor node without moving the cursor itself
			// TODO: Potential use for user warning if CriticMarkup is not closed
			// if (cursor.next() && cursor.name === '⚠') continue;
			// Restore cursor position (warning: recursion error)
			// cursor.prev();

			if (selectionRangeOverlap(selection, start, end)) {
				// Mark CriticMarkup as being edited, disables strikethrough/highlight styling
				widgets.push(
					Decoration.mark({
						attributes: { 'data-contents': 'string' },
						class: 'criticmarkup-editing',
					}).range(start, end),
				);
				continue;
			}

			// Hide brackets {++ and ++}
			widgets.push(
				Decoration.replace({
					attributes: { 'data-contents': 'string' },
				}).range(start, start + 3),
			);

			// if (start + 4 < end - 3 && view.state.doc.slice(start + 3, start + 4).toString().includes(' ')) {
			// 	widgets.push(
			// 		Decoration.replace({
			// 			tag: 'span',
			// 			class: 'remove-strikethrough',
			// 			attributes: { 'data-contents': 'string' },
			// 		}).range(end - 1, end),
			// 	);
			// }


			widgets.push(
				Decoration.mark({
					attributes: { 'data-contents': 'string' },
					class: 'criticmarkup-inline',
				}).range(start - 1, end + 1),
			);


			// FIXME: Strikethrough renders despite text being placed (due to {~~ brackets never being hidden?)
			widgets.push(
				Decoration.replace({
					attributes: { 'data-contents': 'string' },
				}).range(end - 3, end),
			);

			if (name === 'Substitution') {
				cursor.firstChild();
				if (cursor.name !== 'MSub')
					continue;

				widgets.push(
					Decoration.mark({
						attributes: { 'data-contents': 'string' },
						class: 'criticmarkup-inline criticmarkup-deletion',
					}).range(start + 3, cursor.from),
				);

				// Hide arrow marker ~>
				widgets.push(
					Decoration.replace({
						attributes: { 'data-contents': 'string' },
					}).range(cursor.from, cursor.to),
				);

				widgets.push(
					Decoration.mark({
						attributes: { 'data-contents': 'string' },
						class: 'criticmarkup-inline criticmarkup-addition',
					}).range(cursor.from + 3, end - 3),
				);

			} else if (start + 3 !== end - 3) {
				// Render CriticMarkup as *something* (inline/comment style)
				widgets.push(
					Decoration.mark({
						attributes: { 'data-contents': 'string' },
						class: 'criticmarkup-inline criticmarkup-' + name.toLowerCase(),
					}).range(start + 3, end - 3),
				);
			}
		}

		return Decoration.set(widgets, true);
	}

	update(update: ViewUpdate) {
		// @ts-ignore
		const tree = criticmarkupLanguage.parser.parse(update.state.doc.toString(), this.fragments);
		if (tree.length < update.view.viewport.to || update.view.composing)
			this.decorations = this.decorations.map(update.changes);
		// TODO: Figure out how to implement the 'hasEffect' helper function, or determine if it is even necessary
		// @ts-ignore
		else if (tree != this.tree ||
			update.viewportChanged || update.selectionSet /*||
			hasEffect(update.transactions, rerenderEffect) ||
			hasEffect(update.transactions, addMarks) || hasEffect(update.transactions, filterMarks)*/) {

			// @ts-ignore
			this.tree = tree;

			// @ts-ignore
			this.fragments = TreeFragment.addTree(tree, this.fragments);

			this.decorations = this.buildDecorations(update.view) ?? Decoration.none;
		}
	}
}

export function inlinePlugin(): ViewPlugin<any> {
	return ViewPlugin.fromClass(CriticMarkupViewPlugin,
		{ decorations: (v) => v.decorations },
	);
}
