import { Decoration, DecorationSet, EditorView, gutter, PluginValue, ViewPlugin, ViewUpdate } from '@codemirror/view';
import type { EditorSelection, Extension, Range } from '@codemirror/state';
import type { Tree } from '@lezer/common';

import { criticmarkupLanguage } from './parser';
import { TreeFragment } from '@lezer/common';

import { RangeSet, RangeSetBuilder } from '@codemirror/state';
import { CriticMarkupMarker } from './criticmarkup-gutter';
import { nodesInSelection } from './util';
import { Menu } from 'obsidian';
import { acceptAllSuggestions, rejectAllSuggestions } from './commands';

function selectionRangeOverlap(selection: EditorSelection, rangeFrom: number, rangeTo: number) {
	return selection.ranges.some(range => range.from <= rangeTo && range.to >= rangeFrom);
}

class CriticMarkupViewPlugin implements PluginValue {
	markers: RangeSet<CriticMarkupMarker>;
	decorations: DecorationSet;
	tree: Tree;
	fragments: TreeFragment[] = [];

	constructor(view: EditorView) {
		// @ts-ignore
		this.tree = criticmarkupLanguage.parser.parse(view.state.doc.toString());
		// @ts-ignore
		this.fragments = TreeFragment.addTree(this.tree);

		this.decorations = this.buildDecorations(view) ?? Decoration.none;

		this.markers = this.buildMarkers(view);
	}

	buildMarkers(view: EditorView): RangeSet<CriticMarkupMarker> {
		const builder = new RangeSetBuilder<CriticMarkupMarker>();

		let nodes: any[] = nodesInSelection(this.tree);
		nodes = nodes.map(node => {
			node.line_start = view.state.doc.lineAt(node.from).number;
			node.line_end = view.state.doc.lineAt(node.to).number;
			return node;
		})

		let current_line = nodes[0]?.line_start;
		for (const node of nodes) {
			if (current_line > node.line_end) continue;
			for (let i = node.line_start; i <= node.line_end; i++) {
				const line = view.state.doc.line(i);
				builder.add(line.from, line.to,
					new CriticMarkupMarker(
						line.from,
						line.to,
						node.type.toLowerCase(),
						i === node.line_start,
						i === node.line_end,
					));
			}
			current_line = node.line_end + 1;
		}

		return builder.finish();
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

			this.markers = this.buildMarkers(update.view);
		}
	}
}

export function inlinePlugin(): Extension[] {
	const view_plugin = ViewPlugin.fromClass(CriticMarkupViewPlugin,
		{ decorations: (v) => v.decorations },
	);

	const gutter_extension = gutter({
		class: 'cm-criticmarkup',
		markers(view: EditorView) {
			return view.plugin(view_plugin)?.markers ?? RangeSet.empty;
		},
		domEventHandlers: {
			click: (view, line, event: Event) => {
				const menu = new Menu();
				menu.addItem(item => {
					item.setTitle('Accept changes')
						.setIcon('check')
						.onClick(() => {

							view.dispatch({
								changes: acceptAllSuggestions(view.state.doc.toString(), line.from, line.to)
							});
						});

				});
				menu.addItem(item => {
					item.setTitle('Reject changes')
						.setIcon('cross')
						.onClick(() => {
							view.dispatch({
								changes: rejectAllSuggestions(view.state.doc.toString(), line.from, line.to)
							});
						});

				});

				menu.showAtMouseEvent(<MouseEvent>event);

				return true;
			}
		}
	})


	return [view_plugin, gutter_extension]
}
