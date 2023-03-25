import { Menu } from 'obsidian';

import type { Tree } from '@lezer/common';
import { RangeSet, RangeSetBuilder } from '@codemirror/state';
import { EditorView, gutter, GutterMarker } from '@codemirror/view';

import { treeParser } from '../tree-parser';

import { acceptAllSuggestions, rejectAllSuggestions } from '../commands';

import type { PluginSettings } from '../../types';
import { nodesInSelection } from '../editor-util';
import type { CriticMarkupNodes } from '../../types';


export class CriticMarkupMarker extends GutterMarker {
	constructor(readonly from: number, readonly to: number, readonly type: string, readonly top?: boolean, readonly bottom?: boolean) {
		super();
	}

	toDOM() {
		return createDiv({
			cls: `criticmarkup-gutter-${this.type}`
				+ (this.top ? ' criticmarkup-gutter-top' : '')
				+ (this.bottom ? ' criticmarkup-gutter-bottom' : ''),
		});
	}
}

function buildMarkers(view: EditorView, tree: Tree): RangeSet<CriticMarkupMarker> {
	const builder = new RangeSetBuilder<CriticMarkupMarker>();

	// @ts-ignore (Get tree from extension)
	const nodes: CriticMarkupNodes = nodesInSelection(tree);
	const markers = nodes.nodes.map((node: { from: number; to: number;}) => {
		const newnode: any = Object.assign({}, node);
		newnode.line_start = view.state.doc.lineAt(node.from).number;
		newnode.line_end = view.state.doc.lineAt(node.to).number;
		return newnode;
	});

	let current_line = markers[0]?.line_start;
	for (const node of markers) {
		if (current_line > node.line_end) continue;
		for (let i = node.line_start; i <= node.line_end; i++) {
			const line = view.state.doc.line(i);
			builder.add(line.from, line.to,
				new CriticMarkupMarker(
					line.from,
					line.to,
					node.type.toLowerCase(),
					i === node.line_start,
					i === node.line_end,
				));
		}
		current_line = node.line_end + 1;
	}

	return builder.finish();
}


export const gutterExtension = (settings: PluginSettings) => gutter({
	class: 'criticmarkup-gutter' + (!settings.hide_empty_gutter ? ' criticmarkup-gutter-show-empty' : ''),
	markers(view: EditorView) {
		// @ts-ignore (Tree gotten from state field)
		return buildMarkers(view, view.state.field(treeParser).tree) ?? RangeSet.empty;
	},
	domEventHandlers: {
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
