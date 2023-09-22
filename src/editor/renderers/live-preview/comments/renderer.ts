import { type Extension, RangeSetBuilder, StateField, Transaction } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';

import { editorLivePreviewField } from 'obsidian';

import { nodeParser, NodeType } from '../../../base';
import { type PluginSettings } from '../../../../types';

import { CommentIconWidget } from './widget';

export const commentRenderer = (settings: PluginSettings) => StateField.define<DecorationSet>({
	create(state): DecorationSet {
		return Decoration.none;
	},

	update(oldSet: DecorationSet, tr: Transaction) {
		const is_livepreview = tr.state.field(editorLivePreviewField);
		const preview_changed = is_livepreview !== tr.startState.field(editorLivePreviewField);


		// TODO: oldSet.size is a bit overkill, since notes without any comment nodes will always parse the document?
		if (!tr.docChanged && !preview_changed && oldSet.size)
			return oldSet;

		if (preview_changed && !is_livepreview)
			return Decoration.none;

		const builder = new RangeSetBuilder<Decoration>();

		const nodes = tr.state.field(nodeParser).nodes;

		if (is_livepreview) {
			for (const node of nodes.nodes) {
				if (node.type === NodeType.COMMENT) {
					builder.add(
						node.from,
						node.to,
						Decoration.replace({
							widget: new CommentIconWidget(node, settings.comment_style === 'block'),
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

