import { Menu } from 'obsidian';

import type { Tree } from '@lezer/common';
import { RangeSet, RangeSetBuilder } from '@codemirror/state';
import { EditorView, gutter, GutterMarker } from '@codemirror/view';

import { treeParser } from './tree-parser';

import { acceptAllSuggestions, rejectAllSuggestions } from './commands';

import { nodesInSelection } from './editor-util';


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
	let nodes: any[] = nodesInSelection(tree);
	nodes = nodes.map(node => {
		node.line_start = view.state.doc.lineAt(node.from).number;
		node.line_end = view.state.doc.lineAt(node.to).number;
		return node;
	});

	let current_line = nodes[0]?.line_start;
	for (const node of nodes) {
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


export const gutterExtension = () => gutter({
	class: 'criticmarkup-gutter',
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