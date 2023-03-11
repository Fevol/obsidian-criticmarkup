import { treeParser } from './tree-parser';

import type { Tree } from '@lezer/common';
import type { Extension, Range } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, PluginValue, ViewPlugin, ViewUpdate } from '@codemirror/view';

import type { PluginSettings } from '../types';
import { selectionRangeOverlap } from './editor-util';

export function livePreview (settings: PluginSettings): Extension {
	return ViewPlugin.fromClass(
		class CriticMarkupViewPlugin implements PluginValue {
			settings: PluginSettings;
			decorations: DecorationSet;

			constructor(view: EditorView) {
				// @ts-ignore
				const tree = view.state.field(treeParser).tree;
				this.settings = settings;
				this.decorations = (this.settings.live_preview ? this.buildDecorations(tree, view) : null) ?? Decoration.none;
			}

			removeBrackets(widgets: Range<Decoration>[], from: number, to: number) {
				widgets.push(
					Decoration.replace({
						attributes: { 'data-contents': 'string' },
					}).range(from, from + 3),
				);

				widgets.push(
					Decoration.replace({
						attributes: { 'data-contents': 'string' },
					}).range(to - 3, to),
				);
			}

			buildDecorations(tree: Tree, view: EditorView): DecorationSet {
				const widgets: Range<Decoration>[] = [];
				const selection = view.state.selection;

				const cursor = tree.cursor();
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

					if (this.settings.suggestion_status && !(name === 'Comment' || name === 'Highlight')) {
						if (this.settings.suggestion_status === 1) {
							if (name === 'Addition') {
								this.removeBrackets(widgets, start, end);
							} else if (name === 'Deletion') {
								widgets.push(
									Decoration.mark({
										class: 'criticmarkup-hidden',
										attributes: { 'data-contents': 'string' },
									}).range(start, end),
								);
							} else {
								cursor.firstChild();
								if (cursor.name !== 'MSub')
									continue;

								widgets.push(
									Decoration.mark({
										class: 'criticmarkup-hidden',
										attributes: { 'data-contents': 'string' },
									}).range(start, cursor.to),
								);

								widgets.push(
									Decoration.replace({
										attributes: { 'data-contents': 'string' },
									}).range(end - 3, end),
								);
							}
						} else {
							if (name === 'Addition') {
								widgets.push(
									Decoration.mark({
										attributes: { 'data-contents': 'string' },
										class: 'criticmarkup-hidden',
									}).range(start, end),
								);
							} else if (name === 'Deletion') {
								this.removeBrackets(widgets, start, end);
							} else {
								cursor.firstChild();
								if (cursor.name !== 'MSub')
									continue;

								widgets.push(
									Decoration.mark({
										attributes: { 'data-contents': 'string' },
										class: 'criticmarkup-hidden',
									}).range(cursor.from, end),
								);

								widgets.push(
									Decoration.replace({
										attributes: { 'data-contents': 'string' },
									}).range(start, start + 3),
								);
							}
						}
					} else {
						if (selectionRangeOverlap(selection, start, end)) {
							if (!this.settings.editor_styling) {
								widgets.push(
									Decoration.mark({
										attributes: { 'data-contents': 'string' },
										class: 'criticmarkup-editing',
									}).range(start, end),
								);
								continue;
							} else {
								if (name === 'Substitution') {
									cursor.firstChild();
									if (cursor.name !== 'MSub')
										continue;
									if (start + 3 !== cursor.from) {
										widgets.push(
											Decoration.mark({
												attributes: { 'data-contents': 'string' },
												class: 'criticmarkup-editing criticmarkup-inline criticmarkup-substitution criticmarkup-deletion',
											}).range(start + 3, cursor.from),
										);
									}

									if (cursor.to !== end - 3) {
										widgets.push(
											Decoration.mark({
												attributes: { 'data-contents': 'string' },
												class: 'criticmarkup-editing criticmarkup-inline criticmarkup-substitution criticmarkup-addition',
											}).range(cursor.from + 2, end - 3),
										);
									}
								} else {
									widgets.push(
										Decoration.mark({
											attributes: { 'data-contents': 'string' },
											class: `criticmarkup-editing criticmarkup-inline criticmarkup-${name.toLowerCase()}`,
										}).range(start, end),
									);
								}
							}
							continue;
						}

						// FIXME: Strikethrough renders despite text being placed (due to {~~ brackets never being hidden?)
						this.removeBrackets(widgets, start, end);

						if (name === 'Substitution') {
							cursor.firstChild();
							if (cursor.name !== 'MSub')
								continue;

							// Hide arrow marker ~>
							widgets.push(
								Decoration.replace({
									attributes: { 'data-contents': 'string' },
								}).range(cursor.from, cursor.to),
							);

							if (start + 3 !== cursor.from) {
								widgets.push(
									Decoration.mark({
										attributes: { 'data-contents': 'string' },
										class: 'criticmarkup-inline criticmarkup-substitution criticmarkup-deletion',
									}).range(start + 3, cursor.from),
								);
							}

							if (cursor.to !== end - 3) {
								widgets.push(
									Decoration.mark({
										attributes: { 'data-contents': 'string' },
										class: 'criticmarkup-inline criticmarkup-substitution criticmarkup-addition',
									}).range(cursor.from + 2, end - 3),
								);
							}
						} else if (start + 3 !== end - 3) {
							// Render CriticMarkup as *something* (inline/comment style)
							widgets.push(
								Decoration.mark({
									attributes: { 'data-contents': 'string' },
									class: 'criticmarkup-inline criticmarkup-' + name.toLowerCase(),
									spec: { style: 'text-decoration: line-through;' },
								}).range(start + 3, end - 3),
							);
						}
					}


				}

				return Decoration.set(widgets, true);
			}

			async update(update: ViewUpdate) {
				// @ts-ignore (Returns Tree object)
				const tree = update.state.field(treeParser).tree;

				// @ts-ignore
				if (tree.length < update.view.viewport.to || update.view.composing)
					this.decorations = this.decorations.map(update.changes);
					// TODO: Figure out how to implement the 'hasEffect' helper function, or determine if it is even necessary
				/* hasEffect(update.transactions, rerenderEffect) || hasEffect(update.transactions, addMarks) ||
				   hasEffect(update.transactions, filterMarks)*/

				else if (update.viewportChanged || update.selectionSet)
					this.decorations = tree.topNode.firstChild ? this.buildDecorations(tree, update.view) : Decoration.none;
			}
		},
		{
			decorations: (v) => v.decorations,
		},
	);
}
