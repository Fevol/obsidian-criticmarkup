import {EditorView, GutterMarker} from '@codemirror/view';
import {type EditorState, type RangeSet, Line, RangeSetBuilder, StateField} from '@codemirror/state';

import {Component, editorEditorField, MarkdownRenderer, Menu} from 'obsidian';

import {type CommentRange, rangeParser, SuggestionType} from '../../../base';
import {commentGutter} from './index';

export class CommentMarker extends GutterMarker {
    comment_thread: HTMLElement | null = null;
    component: Component = new Component();

    constructor(public comment_range: CommentRange, public view: EditorView) {
        super();
    }

    // TODO: I have many gripes with this implementation, though much fewer ideas on how to fix it
    //    - Comparing hashes of ranges (prevents having to chain together the entire comment thread, but expensive)
    //    - ...
    eq(other: CommentMarker) {
        const base_range = this.comment_range.attached_comment || this.comment_range;
        const other_base_range = other.comment_range.attached_comment || other.comment_range;
        return base_range.equals(other_base_range);
    }

    renderComment(comment: HTMLElement, range: CommentRange, text: string) {
        MarkdownRenderer.render(app, text || "&nbsp;", comment, '', this.component);
        this.renderMetadata(comment, range);
    }

    renderMetadata(comment: HTMLElement, range: CommentRange) {
        const metadataContainer = createSpan({cls: 'criticmarkup-gutter-comment-metadata'});
        comment.insertBefore(metadataContainer, comment.firstChild);

        if (range.metadata) {
            if (range.fields.author) {
                const authorLabel = createSpan({
                    cls: 'criticmarkup-gutter-comment-author-label',
                    text: "Author: "
                });
                metadataContainer.appendChild(authorLabel);

                const author = createSpan({
                    cls: 'criticmarkup-gutter-comment-author-name',
                    text: range.fields.author
                });
                metadataContainer.appendChild(author);
            }
        }
    }

    toDOM() {
        this.comment_thread = createDiv({cls: 'criticmarkup-gutter-comment-thread'});

        this.comment_thread.onclick = (e) => {
            const top = this.view.lineBlockAt(this.comment_range.from).top - 100;

            setTimeout(() => {
                this.view.plugin(commentGutter[1][0][0])!.moveGutter(this);
                this.view.scrollDOM.scrollTo({top, behavior: 'smooth'})
            }, 200);
        }

        const comment_ranges_flattened = this.comment_range.thread;

        for (const range of comment_ranges_flattened) {
            const comment = createDiv({cls: 'criticmarkup-gutter-comment'});
            comment.contentEditable = 'false';

            comment.onblur = () => {
                // Only actually apply changes if the comment has changed
                if (comment.innerText === text) {
                    comment.replaceChildren();
                    comment.innerText = "";
                    comment.contentEditable = 'false';
                    this.renderComment(comment, range, text);
                } else {
                    setTimeout(() => this.view.dispatch({
                        changes: {
                            from: range.from + 3,
                            to: range.to - 3,
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
                        const cursor = this.comment_range.full_range_back;
                        this.view.dispatch({
                            changes: {
                                from: cursor,
                                to: cursor,
                                insert: "{>><<}"
                            },
                        });

                        setTimeout(() => {
                            this.view.plugin(commentGutter[1][0][0])!.focusCommentThread(cursor + 1);
                        });
                    });
                })
                menu.addItem((item) => {
                    item.setTitle("Fold gutter");
                    item.setIcon('arrow-right-from-line');
                    item.onClick(() => {
                        // @ts-ignore Unexposed view
                        this.view.plugin(commentGutter[1][0][0])!.foldGutter();
                    });
                });

                menu.showAtPosition(e);
            }

            this.comment_thread.appendChild(comment);

            const text = range.unwrap();
            this.renderComment(comment, range, text);
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
    const ranges = state.field(rangeParser).ranges;

    let overlapping_block = false;
    let previous_block: Line;
    let stop_next_block = null;

    for (const range of ranges.ranges) {
        if (range.type !== SuggestionType.COMMENT || (range as CommentRange).reply_depth) continue;

        // Mental note to myself: this code exists because the fact that comments
        // can appear across multiple lines/blocks. However, using `tr.state.doc.lineAt(range.from)` or
        // `view.lineBlockAt(range.from)` *will* return the line on which it *would* be rendered, as if it isn't
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

        let block_from: Line = state.doc.lineAt(range.from);
        if (overlapping_block && block_from.from <= stop_next_block!) {
            block_from = previous_block!;
        } else {
            overlapping_block = range.to > block_from.to;
            stop_next_block = range.to;
            previous_block = block_from;
        }

        builder.add(block_from.from, block_from.to - 1, new CommentMarker(range as CommentRange, view));
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
