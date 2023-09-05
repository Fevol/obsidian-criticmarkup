import { EditorState, Line, RangeSet, RangeSetBuilder, StateField } from '@codemirror/state';
import { EditorView, GutterMarker } from '@codemirror/view';
import { NodeType } from '../../types';

import { treeParser } from '../tree-parser';

import { CriticMarkupNode } from '../criticmarkup-nodes';
import { right_gutter } from './right-gutter';
import { Component, editorEditorField, MarkdownRenderer } from 'obsidian';


// TODO: Rerender gutter on Ctrl+Scroll

export class CommentMarker extends GutterMarker {
	comment: HTMLElement | null = null;

	constructor(public node: CriticMarkupNode, public view: EditorView) {
		super();
	}

	eq(other: CommentMarker) {
		return this.node.equals(other.node);
	}

	toDOM() {
		const class_list = '';

		this.comment = createDiv({ cls: class_list });
		this.comment.contentEditable = 'false';

		const component = new Component();
		this.comment.classList.add('criticmarkup-gutter-comment');

		const text = this.node.unwrap();
		MarkdownRenderer.render(app, text || "&nbsp;", this.comment, '', component);

		this.comment.onblur = () => {
			// Only actually apply changes if the comment has changed
			if (this.comment!.innerText === text) {
				this.comment!.replaceChildren();
				this.comment!.innerText = "";
				this.comment!.contentEditable = 'false';
				MarkdownRenderer.render(app, text || "&nbsp;", this.comment!, '', component);
			} else {
				setTimeout(() => this.view.dispatch({
					changes: {
						from: this.node.from + 3,
						to: this.node.to - 3,
						insert: this.comment!.innerText
					},
				}));
			}
		}

		this.comment.onkeyup = (e) => {
			if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
				this.comment!.blur();
			}
		}

		this.comment.ondblclick = (e) => {
			e.stopPropagation();

			this.comment!.contentEditable = 'true';
			this.comment!.replaceChildren();
			this.comment!.innerText = text;
			this.comment!.focus();
		}

		this.comment.onclick = (e) => {
			const top = this.view.lineBlockAt(this.node.from).top - 100;

			setTimeout(() => {
				// @ts-expect-error (Directly accessing function of unexported class)
				this.view.plugin(commentGutterExtension[1][0][0])!.moveGutter(this);
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

function createWidgets(state: EditorState) {
	const builder = new RangeSetBuilder<CommentMarker>();
	const view = state.field(editorEditorField);
	const nodes = state.field(treeParser).nodes;

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

		let block_from: Line = state.doc.lineAt(node.from);
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

export const commentGutterWidgets = StateField.define<RangeSet<CommentMarker>>({
	create(state) {
		return createWidgets(state);
	},

	update(oldSet, tr) {
		if (!tr.docChanged)
			return oldSet;
		return createWidgets(tr.state);
	}
});

export const commentGutterExtension = [
	commentGutterWidgets,
	right_gutter({
		class: 'criticmarkup-comment-gutter' + (app.vault.getConfig('cssTheme') === "Minimal" ? ' is-minimal' : ''),
		markers: v => v.state.field(commentGutterWidgets),
	}),
];
