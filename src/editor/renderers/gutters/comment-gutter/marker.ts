import { EditorView, GutterMarker } from '@codemirror/view';
import { type EditorState, type RangeSet, Line, RangeSetBuilder, StateField } from '@codemirror/state';

import { Component, editorEditorField, MarkdownRenderer, Menu } from 'obsidian';

import { type CommentNode, nodeParser, NodeType } from '../../../base';
import { commentGutter } from './index';

export class CommentMarker extends GutterMarker {
	comment_thread: HTMLElement | null = null;
	component: Component = new Component();

	constructor(public node: CommentNode, public view: EditorView) {
		super();
	}

	// TODO: I have many gripes with this implementation, though much fewer ideas on how to fix it
	//    - Comparing hashes of nodes (prevents having to chain together the entire comment thread, but expensive)
	//    - ...
	eq(other: CommentMarker) {
		const base_node = this.node.attached_comment || this.node;
		const other_base_node = other.node.attached_comment || other.node;
		return base_node.equals(other_base_node);
	}

	renderComment(comment: HTMLElement, node: CommentNode, text: string) {
		MarkdownRenderer.render(app, text || "&nbsp;", comment, '', this.component);
		this.renderMetadata(comment, node);
	}

	renderMetadata(comment: HTMLElement, node: CommentNode) {
		const metadataContainer = createSpan({ cls: 'criticmarkup-gutter-comment-metadata' });
		comment.insertBefore(metadataContainer, comment.firstChild);

		if (node.metadata) {
			if (node.fields.author) {
				const authorLabel = createSpan({
					cls: 'criticmarkup-gutter-comment-author-label',
					text: "Author: "
				});
				metadataContainer.appendChild(authorLabel);

				const author = createSpan({
					cls: 'criticmarkup-gutter-comment-author-name',
					text: node.fields.author
				});
				metadataContainer.appendChild(author);
			}
		}
	}

	toDOM() {
		this.comment_thread = createDiv({ cls: 'criticmarkup-gutter-comment-thread' });

		this.comment_thread.onclick = (e) => {
			const top = this.view.lineBlockAt(this.node.from).top - 100;

			setTimeout(() => {
				// @ts-expect-error (Directly accessing function of unexported class)
				this.view.plugin(commentGutter[1][0][0])!.moveGutter(this);
				this.view.scrollDOM.scrollTo({ top, behavior: 'smooth'})
			}, 200);
		}

		const comment_nodes_flattened = this.node.attached_comment ?
			this.node.attached_comment.replies :
			[this.node, ...this.node.replies];

		for (const node of comment_nodes_flattened) {
			const comment = createDiv({ cls: 'criticmarkup-gutter-comment' });
			comment.contentEditable = 'false';

			comment.onblur = () => {
				// Only actually apply changes if the comment has changed
				if (comment.innerText === text) {
					comment.replaceChildren();
					comment.innerText = "";
					comment.contentEditable = 'false';
					this.renderComment(comment, node, text);
				} else {
					setTimeout(() => this.view.dispatch({
						changes: {
							from: node.from + 3,
							to: node.to - 3,
							insert: comment!.innerText
						},
					}));
				}
			}

			comment.onkeyup = (e) => {
				if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
					comment!.blur();
				} else if (e.key === 'Escape') {
					comment!.innerText = text;
					comment!.blur();
				}
			}

			comment.ondblclick = (e) => {
				e.stopPropagation();

				comment.contentEditable = 'true';
				comment.replaceChildren();
				comment.innerText = text;
				comment.focus();
			}

			comment.oncontextmenu = (e) => {
				e.preventDefault();
				e.stopPropagation();

				const menu = new Menu();
				menu.addItem((item) => {
					item.setTitle("Reply to comment");
					item.setIcon('reply');
					item.onClick(() => {
						const last_reply = this.node.base_node.replies.length ?
							this.node.base_node.replies[this.node.base_node.replies.length - 1] :
							this.node.base_node;

						this.view.dispatch({
							changes: {
								from: last_reply.to,
								to: last_reply.to,
								insert: "{>><<}"
							},
						});

						setTimeout(() => {
							// @ts-expect-error (Directly accessing function of unexported class)
							this.view.plugin(commentGutter[1][0][0])!.focusCommentThread(this.node.base_node.from + 1);
						});
					});
				});

				menu.showAtPosition(e);
			}

			this.comment_thread.appendChild(comment);

			const text = node.unwrap();
			this.renderComment(comment, node, text);
		}

		this.component.load();

		return this.comment_thread;
	}

	focus() {
		this.comment_thread!.focus();
	}

	focus_comment(index: number = -1) {
		if (index === -1)
			index = this.comment_thread!.children.length - 1;
		this.comment_thread!.children.item(index)!.dispatchEvent(new MouseEvent('dblclick'));
	}
}

function createMarkers(state: EditorState) {
	const builder = new RangeSetBuilder<CommentMarker>();
	const view = state.field(editorEditorField);
	const nodes = state.field(nodeParser).nodes;

	let overlapping_block = false;
	let previous_block: Line;
	let stop_next_block = null;

	for (const node of nodes.nodes) {
		if (node.type !== NodeType.COMMENT || (node as CommentNode).reply_depth) continue;

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

		let block_from: Line = state.doc.lineAt(node.from);
		if (overlapping_block && block_from.from <= stop_next_block!) {
			block_from = previous_block!;
		} else {
			overlapping_block = node.to > block_from.to;
			stop_next_block = node.to;
			previous_block = block_from;
		}

		builder.add(block_from.from, block_from.to - 1, new CommentMarker(node as CommentNode, view));
	}

	return builder.finish();
}


export const commentGutterMarkers = StateField.define<RangeSet<CommentMarker>>({
	create(state) {
		return createMarkers(state);
	},

	update(oldSet, tr) {
		if (!tr.docChanged)
			return oldSet;
		return createMarkers(tr.state);
	}
});
