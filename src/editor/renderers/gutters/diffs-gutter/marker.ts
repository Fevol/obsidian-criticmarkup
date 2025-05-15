import { RangeSet, RangeSetBuilder } from "@codemirror/state";
import { EditorView, GutterMarker, type PluginValue, ViewPlugin, ViewUpdate } from "@codemirror/view";

import { rangeParser, SuggestionType } from "../../../base";

export class RangeMarker extends GutterMarker {
	constructor(readonly type: Set<SuggestionType>, readonly top?: boolean, readonly bottom?: boolean) {
		super();
	}

	toDOM() {
		let class_list = "";
		if (this.type.has(SuggestionType.ADDITION))
			class_list += "cmtr-diff-gutter-addition ";
		if (this.type.has(SuggestionType.DELETION))
			class_list += "cmtr-diff-gutter-deletion ";
		if (this.type.has(SuggestionType.SUBSTITUTION))
			class_list += "cmtr-diff-gutter-substitution ";
		if (this.top)
			class_list += "cmtr-diff-gutter-top ";
		if (this.bottom)
			class_list += "cmtr-diff-gutter-bottom ";

		return createDiv({ cls: class_list });
	}
}

export const diffGutterMarkers = ViewPlugin.fromClass(
	class diffGutterMarkers implements PluginValue {
		markers: RangeSet<RangeMarker> = RangeSet.empty;

		constructMarkers(view: EditorView) {
			const ranges = view.state.field(rangeParser).ranges;
			const builder = new RangeSetBuilder<RangeMarker>();

			const line_markers: Record<number, { isStart: boolean; isEnd: boolean; types: Set<SuggestionType> }> = {};

			for (const range of ranges.ranges_in_range(view.viewport.from, view.viewport.to)) {
				const range_line_start = view.state.doc.lineAt(range.from).number;
				const range_line_end = view.state.doc.lineAt(range.to).number;
				const lines = Array.from(
					{ length: range_line_end - range_line_start + 1 },
					(_, i) => range_line_start + i,
				);

				if (line_markers[range_line_start])
					line_markers[range_line_start].isStart = true;
				else
					line_markers[range_line_start] = { isStart: true, isEnd: false, types: new Set() };

				for (const line of lines) {
					if (line_markers[line]) {
						line_markers[line].isEnd = false;
						line_markers[line].types.add(range.type);
					} else {
						line_markers[line] = { isStart: false, isEnd: false, types: new Set([range.type]) };
					}
				}
				if (line_markers[range_line_end])
					line_markers[range_line_end].isEnd = true;
			}

			for (const [line_number, marker] of Object.entries(line_markers)) {
				const line = view.state.doc.line(Number(line_number));
				builder.add(
					line.from,
					line.to,
					new RangeMarker(
						marker.types,
						marker.isStart,
						marker.isEnd,
					),
				);
			}

			this.markers = builder.finish();
		}

		constructor(view: EditorView) {
			this.constructMarkers(view);
		}

		update(update: ViewUpdate) {
			if (update.docChanged || update.viewportChanged || update.heightChanged)
				this.constructMarkers(update.view);
		}
	},
);
