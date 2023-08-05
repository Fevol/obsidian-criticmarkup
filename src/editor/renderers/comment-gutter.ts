import { Extension, Line, RangeSet, RangeSetBuilder, StateField } from '@codemirror/state';
import { EditorView, GutterMarker } from '@codemirror/view';
import { NodeType } from '../../types';

import { treeParser } from '../tree-parser';

import { nodesInSelection } from '../editor-util';
import { CriticMarkupNode, CriticMarkupNodes } from '../criticmarkup-nodes';
import { right_gutter } from './right-gutter';
import { Component, editorEditorField, MarkdownRenderer } from 'obsidian';


// TODO: Rerender gutter on Ctrl+Scroll

export class CommentMarker extends GutterMarker {
	node: CriticMarkupNode;
	comment: HTMLElement | null = null;
	view: EditorView;

	constructor(node: CriticMarkupNode, view: EditorView) {
		super();
		this.node = node;
		this.view = view;
	}

	toDOM() {
		const class_list = '';

		this.comment = createDiv({ cls: class_list });
		this.comment.contentEditable = 'true';

		const component = new Component();
		this.comment.classList.add('criticmarkup-gutter-comment');
		const contents = this.view.state.doc.sliceString(this.node.from + 3, this.node.to - 3);
		MarkdownRenderer.renderMarkdown(contents, this.comment, '', component);

		this.comment.onblur = () => {
			setTimeout(() => this.view.dispatch({
				changes: {
					from: this.node.from + 3,
					to: this.node.to - 3,
					insert: this.comment!.innerText
				}
			}));
		}
		this.comment.onfocus = (e) => {
			this.comment!.innerText = contents;
			const top = this.view.lineBlockAt(this.node.from).top - 100;

			setTimeout(() => {
				// TODO: Probably might need to repeat .focus element here

				// @ts-ignore
				this.view.plugin(commentGutterExtension[1][0][0]).moveGutter(this);
				this.view.scrollDOM.scrollTo({ top, behavior: 'smooth'})
			}, 200);

		}


		component.load();

		return this.comment;
	}

	focus() {
		this.comment!.focus();
	}
}

export const commentGutterWidgets = StateField.define<RangeSet<CommentMarker>>({
	create() {
		return RangeSet.empty;
	},
	update(oldSet, tr) {
		if (!tr.docChanged && oldSet.size)
			return oldSet;

		const tree = tr.state.field(treeParser).tree;
		const builder = new RangeSetBuilder<CommentMarker>();
		const nodes: CriticMarkupNodes = nodesInSelection(tree);
		const view = tr.state.field(editorEditorField);

		for (const node of nodes.nodes) {
			if (node.type !== NodeType.COMMENT) continue;

			const line_from = tr.state.doc.lineAt(node.from);
			builder.add(line_from.from, line_from.to, new CriticMarkupMarker(node, view));
		}

		return builder.finish();
	}
});

export const commentGutterExtension: Extension[] = /*(settings: PluginSettings) =>*/ [
	commentGutterWidgets,
	right_gutter({
		class: 'criticmarkup-comment-gutter' + (app.vault.getConfig('cssTheme') === "Minimal" ? ' is-minimal' : ''),
		markers: v => v.state.field(commentGutterWidgets),
	}),
];
