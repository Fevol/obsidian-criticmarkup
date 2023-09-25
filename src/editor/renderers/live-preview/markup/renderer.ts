import { type Extension, Range, StateField, Transaction } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';

import { editorLivePreviewField } from 'obsidian';

import { nodeParser, CriticMarkupNode, SubstitutionNode, NodeType } from '../../../base';
import { type PluginSettings } from '../../../../types';

function hideBracket(decorations: Range<Decoration>[], node: CriticMarkupNode, left: boolean, is_livepreview: boolean) {
	if (!is_livepreview) return;
	const decoration = Decoration.replace({
		attributes: { 'data-contents': 'string' },
	});

	if (left)
		decorations.push(decoration.range(node.from, node.from + 3));
	else
		decorations.push(decoration.range(node.to - 3, node.to));
}

function hideMetadata(decorations: Range<Decoration>[], node: CriticMarkupNode) {
	if (!node.metadata) return;

	decorations.push(
		Decoration.replace({
			attributes: { 'data-contents': 'string' },
		}).range(node.from + 3, node.metadata + 2),
	);
}

function hideNode(decorations: Range<Decoration>[], node: CriticMarkupNode) {
	decorations.push(
		Decoration.replace({}).range(node.from, node.to),
	);
}

function markContents(decorations: Range<Decoration>[], node: CriticMarkupNode, cls: string, left: boolean | null = null, inclusive = false, apply_styling = true) {
	const offset = inclusive ? 0 : 3;
	const attributes = {
		'data-contents': 'string',
		'data-type': 'criticmarkup-' + node.repr.toLowerCase(),
		'class': cls,
	};

	const decoration = Decoration.mark({ attributes });

	if (node.type === NodeType.SUBSTITUTION) {
		if (left) {
			if (!node.part_is_empty(true))
				decorations.push(decoration.range(node.from + offset, (node as SubstitutionNode).middle));
		} else {
			if (!node.part_is_empty(false))
				decorations.push(decoration.range((node as SubstitutionNode).middle + 2, node.to - offset));
		}
	} else if (!node.empty())
		decorations.push(decoration.range(node.from + offset, node.to - offset));
}

function hideSyntax(decorations: Range<Decoration>[], node: CriticMarkupNode, style: string = '', is_livepreview: boolean) {
	hideBracket(decorations, node, true, is_livepreview);
	hideMetadata(decorations, node);
	markContents(decorations, node, style);
	hideBracket(decorations, node, false, is_livepreview);
}

/**
 * Extension providing styling for the markup and implementation for the preview modes within the Live Preview editor
 * @remark A StateField approach is required due to the fact that hiding/removing text in preview can go beyond the viewport,
 * which does not mesh with the ViewPlugin philosophy
 * @warning Massive slowdown of editor performance when having many CM markings in a single file (>10k),
 * no obvious solutions possible, document scrolling is not affected
 */
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

				const style = `criticmarkup-editing criticmarkup-inline criticmarkup-${node.repr.toLowerCase()} ` + '';

				if (!settings.suggest_mode && in_range) {
					markContents(decorations, node, settings.editor_styling ? style : '', null, true, settings.editor_styling);
				} else if (node.type === NodeType.SUBSTITUTION) {
					hideBracket(decorations, node, true, is_livepreview);
					hideMetadata(decorations, node);
					markContents(decorations, node, style + ' criticmarkup-deletion', true);
					if (is_livepreview) {
						decorations.push(
							Decoration.replace({
								attributes: { 'data-contents': 'string' },
							}).range((node as SubstitutionNode).middle, (node as SubstitutionNode).middle + 2),
						);
					}
					markContents(decorations, node, style + ' criticmarkup-addition', false);
					hideBracket(decorations, node, false, is_livepreview);
				} else {
					hideSyntax(decorations, node, style, is_livepreview);
				}
			} else if (settings.preview_mode === 1) {
				if (node.type === NodeType.ADDITION) {
					hideSyntax(decorations, node, 'criticmarkup-accepted', is_livepreview);
				} else if (node.type === NodeType.DELETION) {
					hideNode(decorations, node);
				} else if (node.type === NodeType.SUBSTITUTION) {
					hideBracket(decorations, node, true, is_livepreview);
					hideMetadata(decorations, node);
					markContents(decorations, node, 'criticmarkup-accepted', true);
					decorations.push(Decoration.replace({}).range((node as SubstitutionNode).middle, node.to));
				} else {
					hideSyntax(decorations, node, '', is_livepreview);
				}
			} else if (settings.preview_mode === 2) {
				if (node.type === NodeType.ADDITION) {
					hideNode(decorations, node);
				} else if (node.type === NodeType.DELETION) {
					hideBracket(decorations, node, true, is_livepreview);
					markContents(decorations, node, 'criticmarkup-accepted');
					hideBracket(decorations, node, false, is_livepreview);
				} else if (node.type === NodeType.SUBSTITUTION) {
					decorations.push(Decoration.replace({}).range(node.from, (node as SubstitutionNode).middle + 2));
					markContents(decorations, node, 'criticmarkup-accepted', false);
					hideBracket(decorations, node, false, is_livepreview);
				} else {
					hideSyntax(decorations, node, '', is_livepreview);
				}
			}
		}
		return Decoration.set(decorations);
	},

	provide(field: StateField<DecorationSet>): Extension {
		return EditorView.decorations.from(field);
	},
});
