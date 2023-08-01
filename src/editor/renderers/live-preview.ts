import { treeParser } from '../tree-parser';

import type { Tree } from '@lezer/common';
import type { Extension, Range, Transaction } from '@codemirror/state';
import { RangeSetBuilder, StateField } from '@codemirror/state';
import {
	Decoration,
	DecorationSet,
	EditorView,
	PluginValue,
	ViewPlugin,
	ViewUpdate,
	WidgetType,
} from '@codemirror/view';

import {
	Component, editorEditorField,
	editorInfoField,
	editorLivePreviewField,
	editorViewField,
	MarkdownRenderer,
	setIcon,
} from 'obsidian';

import type { PluginSettings } from '../../types';
import { NodeType } from '../../types';
import { nodesInSelection, selectionRangeOverlap } from '../editor-util';

export const inlineCommentRenderer = StateField.define<DecorationSet>({
	create(state): DecorationSet {
		return Decoration.none;
	},

	update(oldState: DecorationSet, tr: Transaction) {
		const is_livepreview = tr.state.field(editorLivePreviewField);
		// TODO: Find cleaner way to check if preview was toggled
		const preview_changed = is_livepreview !== tr.startState.field(editorLivePreviewField);


		// TODO: oldState.size is a bit overkill, since notes without any comment nodes will always parse the document?
		if (!tr.docChanged && !preview_changed && oldState.size)
			return oldState;

		if (preview_changed && !is_livepreview)
			return Decoration.none;

		const builder = new RangeSetBuilder<Decoration>();

		const tree: Tree = tr.state.field(treeParser).tree;
		const nodes = nodesInSelection(tree);

		if (is_livepreview) {
			for (const node of nodes.nodes) {
				if (node.type === NodeType.COMMENT) {
					builder.add(
						node.from,
						node.to,
						Decoration.replace({
							widget: new CommentIconWidget(tr.state.sliceDoc(node.from + 3, node.to - 3)),
						})
					);
				}
			}
		}

		return builder.finish();
	},

	provide(field: StateField<DecorationSet>): Extension {
		return EditorView.decorations.from(field);
	}
});


class CommentIconWidget extends WidgetType {
	contents: string;
	tooltip: HTMLElement | null = null;
	icon: HTMLElement | null = null;

	component: Component;
	focused = false;


	constructor(contents: string) {
		super();
		this.contents = contents;
		this.component = new Component();
	}

	renderTooltip() {
		if (!this.tooltip) {
			this.tooltip = document.createElement('div');
			this.tooltip.classList.add('criticmarkup-comment-tooltip');
			MarkdownRenderer.renderMarkdown(this.contents, this.tooltip, '', this.component)
			this.component.load();
			this.icon!.appendChild(this.tooltip);

			// Set tooltip position
			const icon_rect = this.icon!.getBoundingClientRect();
			const tooltip_rect = this.tooltip.getBoundingClientRect();
			this.tooltip.style.left = icon_rect.x - tooltip_rect.x - tooltip_rect.width / 2 + 12 + 'px';
		}
	}

	unrenderTooltip() {
		if (!this.focused && this.tooltip) {
			this.component.unload();
			this.icon!.removeChild(this.tooltip!);
			this.tooltip = null;
		}
	}


	toDOM(view: EditorView): HTMLElement {
		this.icon = document.createElement('span');
		this.icon.classList.add('criticmarkup-comment-icon');
		setIcon(this.icon, 'message-square');

		this.icon.onmouseenter = () => { this.renderTooltip(); }
		this.icon.onclick = () => {
			this.renderTooltip();
			this.focused = true;
		}

		this.icon.onmouseleave = () => {
			this.unrenderTooltip();
			// TODO: Find a better way to check if the tooltip is still focused (requires a document.click listener -> expensive?); .onblur does not work
			this.focused = false;
		}

		// this.icon.onblur = () => {
		// 	this.focused = false;
		// 	this.unrenderTooltip();
		// }

		return this.icon;
	}
}

export function livePreview (settings: PluginSettings): Extension {
	return ViewPlugin.fromClass(
		class CriticMarkupViewPlugin implements PluginValue {
			settings: PluginSettings;
			decorations: DecorationSet;

			constructor(view: EditorView) {
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
				const is_livepreview = view.state.field(editorLivePreviewField);

				const cursor = tree.cursor();
				while (cursor.next()) {
					const start = cursor.from;
					const end = cursor.to;
					const name = cursor.name;


					// FIXME: Parser should in general not detect half-completed nodes ({++), end-start < 6 at least prevents errors due to length
					//			Note: when you have a bracket like {++{++, it will still be parsed regularly
					if (name === '⚠' || name === 'MSub' || end - start < 6) continue;

					// Get next cursor node without moving the cursor itself
					// TODO: Potential use for user warning if CriticMarkup is not closed
					// if (cursor.next() && cursor.name === '⚠') continue;
					// Restore cursor position (warning: recursion error)
					// cursor.prev();

					if (this.settings.preview_mode && !(name === 'Comment' || name === 'Highlight')) {
						// TODO: Add node type to class list for further customization
						// MODE: Accept all suggestions
						if (this.settings.preview_mode === 1) {
							if (is_livepreview)
								this.removeBrackets(widgets, start, end);
							if (name === 'Addition') {
								if (start + 3 !== end - 3)
									widgets.push(
										Decoration.mark({
											class: 'criticmarkup-accepted',
											attributes: { 'data-contents': 'string' },
										}).range(start + 3, end - 3),
									);
							} else if (name === 'Deletion') {
								if (start + 3 !== end - 3)
									widgets.push(
										Decoration.mark({
											class: 'criticmarkup-rejected',
											attributes: { 'data-contents': 'string' },
										}).range(start + 3, end - 3),
									);
							} else {
								cursor.firstChild();
								if (cursor.name !== 'MSub')
									continue;

								widgets.push(
									Decoration.mark({
										class: 'criticmarkup-rejected',
										attributes: { 'data-contents': 'string' },
									}).range(start + 3, cursor.to),
								);


								if (cursor.to !== end - 3)
									widgets.push(
										Decoration.mark({
											class: 'criticmarkup-accepted',
											attributes: { 'data-contents': 'string' },
										}).range(cursor.to + 2, end - 3),
									);
							}
						}

						// MODE: Reject all suggestions
						else {
							if (is_livepreview)
								this.removeBrackets(widgets, start, end);
							if (name === 'Addition') {
								if (start + 3 !== end - 3)
									widgets.push(
										Decoration.mark({
											class: 'criticmarkup-rejected',
											attributes: { 'data-contents': 'string' },
										}).range(start + 3, end - 3),
									);
							} else if (name === 'Deletion') {
								if (start + 3 !== end - 3)
									widgets.push(
										Decoration.mark({
											attributes: { 'data-contents': 'string' },
											class: 'criticmarkup-accepted',
										}).range(start + 3, end - 3),
									);
							} else {
								cursor.firstChild();
								if (cursor.name !== 'MSub')
									continue;

								widgets.push(
									Decoration.mark({
										attributes: { 'data-contents': 'string' },
										class: 'criticmarkup-rejected',
									}).range(cursor.from, end),
								);

								if (start + 3 !== cursor.from)
									widgets.push(
										Decoration.mark({
											attributes: { 'data-contents': 'string' },
											class: 'criticmarkup-accepted',
										}).range(start + 3, cursor.from),
									);
							}
						}
					} else {
						if (selectionRangeOverlap(selection, start, end)) {
							if (!this.settings.editor_styling && !this.settings.suggest_mode) {
								widgets.push(
									Decoration.mark({
										attributes: { 'data-contents': 'string' },
										class: 'criticmarkup-editing',
									}).range(start, end),
								);
								continue;
							} else {
								if (this.settings.suggest_mode && is_livepreview)
									this.removeBrackets(widgets, start, end);

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

									if (this.settings.suggest_mode && is_livepreview) {
										widgets.push(
											Decoration.replace({
												attributes: { 'data-contents': 'string' },
											}).range(cursor.to - 2, cursor.to),
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
						if (is_livepreview)
							this.removeBrackets(widgets, start, end);

						if (name === 'Substitution') {
							cursor.firstChild();
							if (cursor.name !== 'MSub')
								continue;

							if (is_livepreview) {
								widgets.push(
									Decoration.replace({
										attributes: { 'data-contents': 'string' },
									}).range(cursor.from, cursor.to),
								);
							}

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
				const tree = update.state.field(treeParser).tree;

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
