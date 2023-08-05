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

		let overlapping_block = false;
		let previous_block: Line;
		let stop_next_block = null;

		for (const node of nodes.nodes) {
			if (node.type !== NodeType.COMMENT) continue;

			// Mental note to myself: this code exists because the fact that comments
			// can appear across multiple lines/blocks. However, using `tr.state.doc.lineAt(node.from)` or
			// `view.lineBlockAt(node.from)` *will* return the line on which it *would* be rendered, as if it isn't
			// a different block.
			// However, in right-gutter UpdateContext.line(), the blockInfo *does* consider every line to be part of the block
			// due to the fact that it grabs from `view.viewportLineBlocks` (because it is then actually rendered?)
			// Either way CodeMirror is sometimes fucky wucky, and this at least works somewhat
			//
			// Also, the reason why I'm even fixing this whole ordeal: if multiple comments exist on the same line (block)
			// and one of them gets overflowed, then all subsequent comments disappear.
			// Is this an issue anybody is likely to encounter? Probably not.
			// But I noticed it and now I'm contractually and morally obligated to at least do the programmatic
			// equivalent of sweeping my issues under the rug
			//
			// As to why I'm making this entire rant: it took me four hours to figure out

			// Oh yeah, and that doesn't even MENTION the fact that RangeSet is a heap and thus does not keep the
			// order of the widgets, so comments in the same block have no guarantee of appearing in the same error,
			// so your comment about a reference might instead be added to something else entirely within the same block
			// ... I should probably make a separate FIXME for that

			let block_from: Line = tr.state.doc.lineAt(node.from);
			if (overlapping_block && block_from.from <= stop_next_block!) {
				block_from = previous_block!;
			} else {
				overlapping_block = node.to > block_from.to;
				stop_next_block = node.to;
				previous_block = block_from;
			}

			builder.add(block_from.from, block_from.to - 1, new CommentMarker(node, view));
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
