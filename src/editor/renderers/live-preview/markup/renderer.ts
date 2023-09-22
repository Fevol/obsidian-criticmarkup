import { type Extension, Range, StateField, Transaction } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';

import { editorLivePreviewField } from 'obsidian';

import { nodeParser, CriticMarkupNode, SubstitutionNode, NodeType } from '../../../base';
import { type PluginSettings } from '../../../../types';

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

export const markupRenderer = (settings: PluginSettings) => StateField.define<DecorationSet>({
	create(state): DecorationSet {
		return Decoration.none;
	},

	update(oldSet: DecorationSet, tr: Transaction) {
		const is_livepreview = tr.state.field(editorLivePreviewField);
		const nodes = tr.state.field(nodeParser).nodes;

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
				// FIXME: Always remove brackets in source mode!

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
