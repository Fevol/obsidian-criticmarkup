import { Menu } from 'obsidian';

import type { Tree } from '@lezer/common';
import { RangeSet, RangeSetBuilder } from '@codemirror/state';
import { EditorView, gutter, GutterMarker } from '@codemirror/view';
import { NodeType, type PluginSettings } from '../../types';

import { treeParser } from '../tree-parser';

import { acceptAllSuggestions, rejectAllSuggestions } from '../commands';

import { nodesInSelection } from '../editor-util';
import { CriticMarkupNodes } from '../criticmarkup-nodes';


// TODO: Rerender gutter on Ctrl+Scroll

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

function buildMarkers(view: EditorView, tree: Tree): RangeSet<CriticMarkupMarker> {
	const builder = new RangeSetBuilder<CriticMarkupMarker>();

	const nodes: CriticMarkupNodes = nodesInSelection(tree);

	const markers = nodes.nodes.map((node) => {
		return {
			type: node.type,
			line_start: view.state.doc.lineAt(node.from).number,
			line_end: view.state.doc.lineAt(node.to).number,
		};
	});

	const line_numbers = [...Array(view.state.doc.lines + 1).keys()];
	line_numbers.shift();
	const line_markers: Record<number, { isStart: boolean, isEnd: boolean, types: Set<NodeType> }> = {};
	line_numbers.forEach((line_number: number) => {
		line_markers[line_number] = { isStart: false, isEnd: false, types: new Set([]) };
	});

	for (const node of markers) {
		if (!line_markers[node.line_start].types.size)
			line_markers[node.line_start].isStart = true;
		for (let i = node.line_start; i <= node.line_end; i++) {
			line_markers[i].isEnd = false;
			line_markers[i].types.add(node.type);
		}
		line_markers[node.line_end].isEnd = true;
	}

	for (const line_number of line_numbers) {
		const marker = line_markers[line_number];
		const line = view.state.doc.line(line_number);
		builder.add(line.from, line.to, new CriticMarkupMarker(
			marker.types,
			marker.isStart,
			marker.isEnd,
		));
	}

	return builder.finish();
}

export const gutterExtension = (settings: PluginSettings) => gutter({
	class: 'criticmarkup-gutter' + (!settings.hide_empty_gutter ? ' criticmarkup-gutter-show-empty' : '') + (app.vault.getConfig('cssTheme') === 'Minimal' ? ' is-minimal' : ''),
	markers(view: EditorView) {
		return buildMarkers(view, view.state.field(treeParser).tree) ?? RangeSet.empty;
	},
	domEventHandlers: {
		// FIXME: Not clickable on first go (results in users not knowing this feature exists)
		click: (view, line, event: Event) => {
			const menu = new Menu();
			menu.addItem(item => {
				item.setTitle('Accept changes')
					.setIcon('check')
					.onClick(() => {
						view.dispatch({
							changes: acceptAllSuggestions(view.state, line.from, line.to),
						});
					});

			});
			menu.addItem(item => {
				item.setTitle('Reject changes')
					.setIcon('cross')
					.onClick(() => {
						view.dispatch({
							changes: rejectAllSuggestions(view.state, line.from, line.to),
						});
					});

			});

			menu.showAtMouseEvent(<MouseEvent>event);

			return false;
		},
	},
});
