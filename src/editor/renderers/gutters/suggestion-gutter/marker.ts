import { EditorView, GutterMarker, type PluginValue, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { RangeSet, RangeSetBuilder } from '@codemirror/state';

import { nodeParser, NodeType } from '../../../base';

export class CriticMarkupMarker extends GutterMarker {
	constructor(readonly type: Set<NodeType>, readonly top?: boolean, readonly bottom?: boolean) {
		super();
	}

	toDOM() {
		let class_list = '';
		if (this.type.has(NodeType.ADDITION))
			class_list += 'criticmarkup-gutter-addition ';
		if (this.type.has(NodeType.DELETION))
			class_list += 'criticmarkup-gutter-deletion ';
		if (this.type.has(NodeType.SUBSTITUTION))
			class_list += 'criticmarkup-gutter-substitution ';
		if (this.top)
			class_list += 'criticmarkup-gutter-top ';
		if (this.bottom)
			class_list += 'criticmarkup-gutter-bottom ';

		return createDiv({ cls: class_list });
	}
}

export const criticmarkupGutterMarkers = ViewPlugin.fromClass(class CriticmarkupGutterMarkers implements PluginValue {
	markers: RangeSet<CriticMarkupMarker> = RangeSet.empty;

	constructMarkers(view: EditorView) {
		const nodes = view.state.field(nodeParser).nodes;
		const builder = new RangeSetBuilder<CriticMarkupMarker>();

		const line_markers: Record<number, { isStart: boolean, isEnd: boolean, types: Set<NodeType> }> = {};

		for (const node of nodes.nodes) {
			if (!view.visibleRanges.some(range => node.partially_in_range(range.from, range.to)))
				continue;

			const node_line_start = view.state.doc.lineAt(node.from).number;
			const node_line_end = view.state.doc.lineAt(node.to).number;
			const lines = Array.from({ length: node_line_end - node_line_start + 1 }, (_, i) => node_line_start + i);

			if (line_markers[node_line_start])
				line_markers[node_line_start].isStart = true;
			else
				line_markers[node_line_start] = { isStart: true, isEnd: false, types: new Set()};

			for (const line of lines) {
				if (line_markers[line]) {
					line_markers[line].isEnd = false;
					line_markers[line].types.add(node.type);
				} else {
					line_markers[line] = { isStart: false, isEnd: false, types: new Set([node.type]) };
				}
			}
			if (line_markers[node_line_end])
				line_markers[node_line_end].isEnd = true;
		}

		for (const [line_number, marker] of Object.entries(line_markers)) {
			const line = view.state.doc.line(Number(line_number));
			builder.add(line.from, line.to, new CriticMarkupMarker(
				marker.types,
				marker.isStart,
				marker.isEnd,
			));
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
});