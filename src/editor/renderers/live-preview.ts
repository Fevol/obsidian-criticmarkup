import { treeParser } from '../tree-parser';

import type { Tree } from '@lezer/common';
import type { Extension, Range, Transaction } from '@codemirror/state';
import { RangeSetBuilder, StateField } from '@codemirror/state';
import {
	Decoration,
	type DecorationSet,
	EditorView,
	type PluginValue,
	ViewPlugin,
	ViewUpdate,
	WidgetType,
} from '@codemirror/view';

import {
	Component,
	editorLivePreviewField,
	MarkdownRenderer,
	setIcon,
} from 'obsidian';

import type { PluginSettings } from '../../types';
import { NodeType } from '../../types';
import { nodesInSelection, selectionRangeOverlap } from '../editor-util';
import { CriticMarkupNode, SubstitutionNode } from '../criticmarkup-nodes';
import { commentGutterWidgets } from './comment-gutter';


export const inlineCommentRenderer = (settings: PluginSettings) => StateField.define<DecorationSet>({
	create(state): DecorationSet {
		return Decoration.none;
	},

	update(oldSet: DecorationSet, tr: Transaction) {
		const is_livepreview = tr.state.field(editorLivePreviewField);
		// TODO: Find cleaner way to check if preview was toggled
		const preview_changed = is_livepreview !== tr.startState.field(editorLivePreviewField);


		// TODO: oldSet.size is a bit overkill, since notes without any comment nodes will always parse the document?
		if (!tr.docChanged && !preview_changed && oldSet.size)
			return oldSet;

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
							widget: new CommentIconWidget(node, tr.state.sliceDoc(node.from + 3, node.to - 3), settings.comment_style === 'block'),
						}),
					);
				}
			}
		}

		return builder.finish();
	},

	provide(field: StateField<DecorationSet>): Extension {
		return EditorView.decorations.from(field);
	},
});


class CommentIconWidget extends WidgetType {
	contents: string;
	tooltip: HTMLElement | null = null;
	icon: HTMLElement | null = null;

	node: CriticMarkupNode;

	component: Component;
	focused = false;
	is_block = false;

	constructor(node: CriticMarkupNode, contents: string, is_block = false) {
		super();
		this.node = node;
		this.contents = contents;
		this.is_block = is_block;
		this.component = new Component();
	}

	renderTooltip() {
		if (!this.tooltip) {
			this.tooltip = document.createElement('div');
			this.tooltip.classList.add('criticmarkup-comment-tooltip');
			MarkdownRenderer.render(app, this.contents, this.tooltip, '', this.component);
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

		if (this.is_block) {
			this.icon.onclick = (e) => {
				const gutterElements = view.state.field(commentGutterWidgets);
				e.preventDefault();
				gutterElements.between(this.node.from, this.node.to, (from, to, widget) => {
					if (this.node.equals(widget.node)) {
						widget.comment!.dispatchEvent(new MouseEvent('dblclick'));
						return false;
					}
				});
			};
		} else {
			if (this.contents.length) {
				this.icon.onmouseenter = () => {
					this.renderTooltip();
				};
				this.icon.onclick = () => {
					this.renderTooltip();
					this.focused = true;
				};

				this.icon.onmouseleave = () => {
					this.unrenderTooltip();
					// TODO: Find a better way to check if the tooltip is still focused (requires a document.click listener -> expensive?); .onblur does not work
					this.focused = false;
				};
			}
		}

		// this.icon.onblur = () => {
		// 	this.focused = false;
		// 	this.unrenderTooltip();
		// }

		return this.icon;
	}
}

function removeBrackets(decorations: Range<Decoration>[], node: CriticMarkupNode, is_livepreview: boolean) {
	if (!is_livepreview) return;
	decorations.push(
		Decoration.replace({
			attributes: { 'data-contents': 'string' },
		}).range(node.from, node.from + 3),
	);
	decorations.push(
		Decoration.replace({
			attributes: { 'data-contents': 'string' },
		}).range(node.to - 3, node.to),
	);
}

function removeBracket(decorations: Range<Decoration>[], node: CriticMarkupNode, left: boolean, is_livepreview: boolean) {
	if (!is_livepreview) return;

	if (left)
		decorations.push(
			Decoration.replace({
				attributes: { 'data-contents': 'string' },
			}).range(node.from, node.from + 3),
		);
	else
		decorations.push(
			Decoration.replace({
				attributes: { 'data-contents': 'string' },
			}).range(node.to - 3, node.to),
		);
}

function hideNode(decorations: Range<Decoration>[], node: CriticMarkupNode) {
	decorations.push(
		Decoration.replace({}).range(node.from, node.to),
	);
}

function markContents(decorations: Range<Decoration>[], node: CriticMarkupNode, style: string, left: boolean | null = null) {
	if (node.type === NodeType.SUBSTITUTION) {
		if (left) {
			if (!node.part_is_empty(true)) {
				decorations.push(
					Decoration.mark({
						attributes: { 'data-contents': 'string' },
						class: style,
					}).range(node.from + 3, (node as SubstitutionNode).middle),
				);
			}
		} else {
			if (!node.part_is_empty(false)) {
				decorations.push(
					Decoration.mark({
						attributes: { 'data-contents': 'string' },
						class: style,
					}).range((node as SubstitutionNode).middle + 2, node.to - 3),
				);
			}
		}
	} else {
		if (!node.empty()) {
			decorations.push(
				Decoration.mark({
					attributes: { 'data-contents': 'string' },
					class: style,
				}).range(node.from + 3, node.to - 3),
			);
		}
	}
}

export const livePreviewRenderer = (settings: PluginSettings) => StateField.define<DecorationSet>({
	create(state): DecorationSet {
		return Decoration.none;
	},

	update(oldSet: DecorationSet, tr: Transaction) {
		const is_livepreview = tr.state.field(editorLivePreviewField);
		const tree = tr.state.field(treeParser).tree;
		const nodes = nodesInSelection(tree);

		// const builder = new RangeSetBuilder<Decoration>();
		const decorations: Range<Decoration>[] = [];

		for (const node of nodes.nodes) {
			if (!settings.preview_mode) {
				const in_range = tr.selection?.ranges?.some(range => node.partially_in_range(range.from, range.to));

				if (!settings.suggest_mode && in_range && !settings.editor_styling) {
					markContents(decorations, node, 'criticmarkup-editing');
				} else if (node.type === NodeType.SUBSTITUTION) {
					removeBracket(decorations, node, true, is_livepreview);
					markContents(decorations, node, 'criticmarkup-editing criticmarkup-inline criticmarkup-deletion criticmarkup-substitution', true);
					if (is_livepreview) {
						decorations.push(
							Decoration.replace({
								attributes: { 'data-contents': 'string' },
							}).range((node as SubstitutionNode).middle, (node as SubstitutionNode).middle + 2),
						);
					}
					markContents(decorations, node, 'criticmarkup-editing criticmarkup-inline criticmarkup-addition criticmarkup-substitution', false);
					removeBracket(decorations, node, false, is_livepreview);
				} else {
					removeBracket(decorations, node, true, is_livepreview);
					markContents(decorations, node, `criticmarkup-editing criticmarkup-inline criticmarkup-${node.repr.toLowerCase()}`);
					removeBracket(decorations, node, false, is_livepreview);
				}
			} else if (settings.preview_mode === 1) {
				if (node.type === NodeType.ADDITION) {
					removeBracket(decorations, node, true, is_livepreview);
					markContents(decorations, node, 'criticmarkup-accepted');
					removeBracket(decorations, node, false, is_livepreview);
				} else if (node.type === NodeType.DELETION) {
					// markContents(decorations, node, 'rejected')
					hideNode(decorations, node);
				} else if (node.type === NodeType.SUBSTITUTION) {
					decorations.push(Decoration.replace({}).range(node.from, node.from + 3));
					markContents(decorations, node, 'criticmarkup-accepted', true);
					// markContents(decorations, node, 'rejected', false)
					decorations.push(Decoration.replace({}).range((node as SubstitutionNode).middle, node.to));
				} else {
					removeBrackets(decorations, node, is_livepreview);
				}
			} else if (settings.preview_mode === 2) {
				if (node.type === NodeType.ADDITION) {
					// markContents(decorations, node, 'rejected');
					hideNode(decorations, node);
				} else if (node.type === NodeType.DELETION) {
					removeBracket(decorations, node, true, is_livepreview);
					markContents(decorations, node, 'criticmarkup-accepted');
					removeBracket(decorations, node, false, is_livepreview);
				} else if (node.type === NodeType.SUBSTITUTION) {
					decorations.push(Decoration.replace({}).range(node.from, (node as SubstitutionNode).middle + 2));
					// markContents(decorations, node, 'rejected', true);
					markContents(decorations, node, 'criticmarkup-accepted', false);
					decorations.push(Decoration.replace({}).range(node.to - 3, node.to));
				} else {
					removeBrackets(decorations, node, is_livepreview);
				}
			}
		}
		return Decoration.set(decorations);
	},

	provide(field: StateField<DecorationSet>): Extension {
		return EditorView.decorations.from(field);
	},
});
