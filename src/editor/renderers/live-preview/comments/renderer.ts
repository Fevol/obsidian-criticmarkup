import { type Extension, RangeSetBuilder, StateField, Transaction } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

import { editorLivePreviewField } from "obsidian";

import { type PluginSettings } from "../../../../types";
import { CommentRange, rangeParser, SuggestionType } from "../../../base";

import { CommentIconWidget } from "./widget";

export const commentRenderer = (settings: PluginSettings) =>
	StateField.define<DecorationSet>({
		create(state): DecorationSet {
			return Decoration.none;
		},

		update(oldSet: DecorationSet, tr: Transaction) {
			const is_livepreview = tr.state.field(editorLivePreviewField);
			const preview_changed = is_livepreview !== tr.startState.field(editorLivePreviewField);

			// TODO: oldSet.size is a bit overkill, since notes without any comment ranges will always parse the document?
			if (!tr.docChanged && !preview_changed && oldSet.size)
				return oldSet;

			if (preview_changed && !is_livepreview)
				return Decoration.none;

			const builder = new RangeSetBuilder<Decoration>();

			const ranges = tr.state.field(rangeParser).ranges;

			if (is_livepreview) {
				for (const range of ranges.ranges) {
					if (range.type === SuggestionType.COMMENT) {
						if (range.base_range === range) {
							builder.add(
								range.from,
								range.to,
								Decoration.replace({
									widget: new CommentIconWidget(range, settings.annotation_gutter),
								}),
							);
						} else {
							builder.add(range.from, range.to, Decoration.replace({}));
						}
					}
				}
			}

			return builder.finish();
		},

		provide(field: StateField<DecorationSet>): Extension {
			return EditorView.decorations.from(field);
		},
	});
