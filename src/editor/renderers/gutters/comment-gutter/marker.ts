import {EditorView, GutterMarker} from '@codemirror/view';
import {type EditorState, Line, Range, RangeSet, StateField} from '@codemirror/state';

import {Component, editorEditorField, MarkdownRenderer, Menu, Notice} from 'obsidian';

import {type CommentRange, CriticMarkupRange, rangeParser, SuggestionType} from '../../../base';
import {addCommentToView, commentGutter} from './index';
import {create_range} from "../../../base/edit-util/range-create";
import {COMMENTATOR_GLOBAL} from "../../../../global";
import {EmbeddableMarkdownEditor} from "../../../../ui/embeddable-editor";

class CommentNode extends Component {
    text: string;
    new_text: string | null = null;
    comment_container: HTMLElement;
    metadata_view: HTMLElement;
    comment_view: HTMLElement;

    currentMode: "preview" | "source" | null = null;
    editMode: EmbeddableMarkdownEditor | null = null;

    constructor(public range: CommentRange, public marker: CommentMarker) {
        super();

        this.text = range.unwrap();
        this.comment_container = this.marker.comment_thread.createDiv({cls: 'criticmarkup-gutter-comment'});
        this.metadata_view = this.comment_container.createDiv({cls: 'criticmarkup-gutter-comment-metadata'});
        this.comment_view = this.comment_container.createDiv({cls: 'criticmarkup-gutter-comment-view'});

        this.comment_container.addEventListener("blur", this.renderPreview.bind(this));
        this.comment_container.addEventListener("dblclick", this.renderSource.bind(this));
        this.comment_container.addEventListener("contextmenu", this.onCommentContextmenu.bind(this));

        this.renderMetadata();
        this.renderPreview();
    }

    onload() {
        super.onload();
    }

    onunload() {
        super.onunload();

        this.comment_container.remove();
        this.editMode = null
    }

    renderMetadata() {
        if (this.range.metadata) {
            if (this.range.fields.author) {
                const authorLabel = createSpan({
                    cls: 'criticmarkup-gutter-comment-author-label',
                    text: "Author: "
                });
                this.metadata_view.appendChild(authorLabel);

                const author = createSpan({
                    cls: 'criticmarkup-gutter-comment-author-name',
                    text: this.range.fields.author
                });
                this.metadata_view.appendChild(author);
            }

            if (this.range.fields.time) {
                if (this.metadata_view.children.length > 0) {
                    const separator = createSpan({
                        cls: 'criticmarkup-gutter-comment-metadata-separator',
                        text: " • "
                    });
                    this.metadata_view.appendChild(separator);
                }

                const timeLabel = createSpan({
                    cls: 'criticmarkup-gutter-comment-time-label',
                    text: "Updated at: "
                });
                this.metadata_view.appendChild(timeLabel);

                const time = createSpan({
                    cls: 'criticmarkup-gutter-comment-time',
                    text: window.moment.unix(this.range.fields.time!).format('MMM DD YYYY, HH:mm')
                });
                this.metadata_view.appendChild(time);
            }
        }
    }

    renderSource(e?: MouseEvent) {
        e?.stopPropagation();
        if (this.currentMode === "source") return;

        this.comment_container.toggleClass('criticmarkup-gutter-comment-editing', true);
        if (this.range.fields.author && this.range.fields.author !== COMMENTATOR_GLOBAL.PLUGIN_SETTINGS.author) {
            new Notice("You cannot edit comments from other authors.");
            return;
        }

        this.comment_view.empty();
        this.editMode = this.addChild(new EmbeddableMarkdownEditor(app, this.comment_view, {
            value: this.text,
            cls: "criticmarkup-gutter-comment-editor",
            onSubmit: (editor) => {
                this.new_text = editor.get();
                this.renderPreview();
            },
            // TODO: Get a reference to the plugin somehow
            filteredExtensions: [app.plugins.plugins["commentator"].editorExtensions],
            onBlur: this.renderPreview.bind(this),
        }));
        this.currentMode = "source";
    }

    renderPreview() {
        if (this.currentMode === "preview") return;

        this.comment_container.toggleClass('criticmarkup-gutter-comment-editing', false);
        if (this.text === this.new_text || this.new_text === null) {
            this.new_text = null;
            if (this.editMode) {
                this.removeChild(this.editMode);
                this.editMode = null;
            }
            this.comment_view.empty();
            MarkdownRenderer.render(app, this.text || "&nbsp;", this.comment_view, '', this);
            this.currentMode = "preview";
        } else {
            setTimeout(() => this.marker.view.dispatch({
                changes: {
                    from: this.range.from,
                    to: this.range.to,
                    insert: create_range(SuggestionType.COMMENT, this.new_text!)
                },
            }));
        }
    }

    onCommentContextmenu(e: MouseEvent) {
        e.preventDefault();
        e.stopPropagation();

        const menu = new Menu();
        menu.addItem((item) => {
            item.setTitle("Edit comment")
                .setIcon('pencil')
                .onClick(() => {
                    this.renderSource();
                });
        });
        menu.addItem((item) => {
            item.setTitle("Reply to comment")
                .setIcon('reply')
                .onClick(() => {
                    addCommentToView(this.marker.view, this.range);
                });
        })
        menu.addItem((item) => {
            item.setTitle("Fold gutter")
                .setIcon('arrow-right-from-line')
                .onClick(() => {
                    this.marker.view.plugin(commentGutter[1][0][0])!.foldGutter();
                });
        });

        menu.showAtPosition(e);
    }
}


export class CommentMarker extends GutterMarker {
    comment_thread!: HTMLElement;
    component: Component = new Component();

    constructor(public comment_range: CommentRange, public view: EditorView, public itr = 0) {
        super();
    }

    eq(other: CommentMarker) {
        return this.itr === other.itr && this.comment_range.equals(other.comment_range);
    }

    onCommentThreadClick() {
        const top = this.view.lineBlockAt(this.comment_range.from).top - 100;

        setTimeout(() => {
            this.view.plugin(commentGutter[1][0][0])!.moveGutter(this);
            this.view.scrollDOM.scrollTo({top, behavior: 'smooth'})
        }, 200);

        this.comment_thread.classList.add('criticmarkup-gutter-comment-thread-highlight');
        setTimeout(() => this.comment_thread.classList.remove('criticmarkup-gutter-comment-thread-highlight'), 4000);
    }

    toDOM() {
        this.comment_thread = createDiv({cls: 'criticmarkup-gutter-comment-thread'});
        this.comment_thread.addEventListener("click", this.onCommentThreadClick.bind(this));

        for (const range of this.comment_range.thread)
            this.component.addChild(new CommentNode(range, this));
        this.component.load();

        return this.comment_thread;
    }

    focus() {
        this.comment_thread.focus();
    }

    focus_comment(index: number = -1) {
        if (index === -1)
            index = this.comment_thread.children.length - 1;
        this.comment_thread.children.item(index)!.dispatchEvent(new MouseEvent('dblclick'));
    }

    destroy() {
        this.component.unload();
        this.comment_thread.remove();
    }
}

function createMarkers(state: EditorState, changed_ranges: CriticMarkupRange[]) {
    const view = state.field(editorEditorField);

    let overlapping_block = false;
    let previous_block: Line;
    let stop_next_block = null;

    const cm_ranges: Range<CommentMarker>[] = [];
    for (const range of changed_ranges) {
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

        cm_ranges.push({
            from: block_from.from,
            to: block_from.to - 1,
            value: new CommentMarker(range as CommentRange, view, itr)
        })
    }

    return cm_ranges;
}

let itr = 0;
export const commentGutterMarkers = StateField.define<RangeSet<CommentMarker>>({
    create(state) {
        return RangeSet.of<CommentMarker>(createMarkers(state, state.field(rangeParser).ranges.ranges));
    },

    update(oldSet, tr) {
        if (!tr.docChanged)
            return oldSet;


        itr += 1;

        const added_threads: CriticMarkupRange[] = [];
        for (const range of tr.state.field(rangeParser).inserted_ranges) {
            if (range.type === SuggestionType.COMMENT && !added_threads.includes(range.base_range))
                added_threads.push(range.base_range);
        }
        const deleted_threads = tr.state.field(rangeParser).deleted_ranges
            .filter(range => range.type === SuggestionType.COMMENT) as CommentRange[];

        return oldSet.map(tr.changes)
            .update({
                filter: (from, to, value) => { return !deleted_threads.some(thread => thread.has_comment(value.comment_range)) },
                add: createMarkers(tr.state, added_threads.map(range => range.thread[0]))
            });
    }
});
