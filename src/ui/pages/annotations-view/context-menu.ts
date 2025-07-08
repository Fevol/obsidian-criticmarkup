import {MarkdownView, Menu, TFile} from "obsidian";
import type CommentatorPlugin from "../../../main";
import {
    addCommentToView,
    applyToFile, CommentRange,
    type CriticMarkupRangeEntry,
    groupRangeEntryByPath,
    SuggestionType
} from "../../../editor/base";
import {applyRangeEditsToVault, centerRangeInEditorView} from "../../../editor/uix";
import {annotationGutterFocusAnnotation} from "../../../editor/renderers/gutters/annotations-gutter";
import {EditorSelection} from "@codemirror/state";


export function onContextMenu(
    plugin: CommentatorPlugin,
    e: MouseEvent,
    ranges: CriticMarkupRangeEntry[]
) {
    const menu = new Menu();

    const used_types = new Set(ranges.map((range) => range.range.type));
    const use_warning = ranges.length > 20;
    const multiple_ranges = ranges.length > 1;

    // EXPL: Only suggestions are used
    if (!(used_types.has(SuggestionType.COMMENT) || used_types.has(SuggestionType.HIGHLIGHT))) {
        menu.addItem((item) => {
            item
                .setTitle(multiple_ranges ? "Apply selected changes" : "Apply change")
                .setIcon("check")
                .setSection("close-annotation")
                .setWarning(use_warning)
                .onClick(async () => applyRangeEditsToVault(plugin, ranges, applyToFile.bind(null, (range, _) => range.accept())));
        });
        menu.addItem((item) => {
            item
                .setTitle(multiple_ranges ? "Reject selected changes" : "Reject change")
                .setIcon("cross")
                .setSection("close-annotation")
                .setWarning(use_warning)
                .onClick(async () => applyRangeEditsToVault(plugin, ranges, applyToFile.bind(null, (range, _) => range.reject())))
        });
    } else if (used_types.size === 1 && used_types.has(SuggestionType.COMMENT)) {
        menu.addItem((item) => {
            item
                .setTitle(multiple_ranges ? "Remove selected comment threads" : "Remove comment thread")
                .setIcon("message-square-off")
                .setSection("close-annotation")
                .setWarning(use_warning)
                .onClick(async () => applyRangeEditsToVault(plugin, ranges, applyToFile.bind(null, (range, _) => "")));
        });
    } else {
        menu.addItem((item) => {
            item
                .setTitle(multiple_ranges ? "Remove selected threads" : "Remove thread")
                .setIcon("trash")
                .setSection("close-annotation")
                .setWarning(use_warning)
                .onClick(async () => applyRangeEditsToVault(plugin, ranges, applyToFile.bind(null, (range, _) => "")));
        });
    }


    if (!multiple_ranges) {
        const {range, path} = ranges[0];

        menu.addItem((item) => {
            item
                .setTitle("Add reply")
                .setIcon("reply")
                .setSection("comment-handling")
                .onClick(async (evt) => {
                    // TODO: This is temporary, ideally, this should be handled inside the view
                    const file = plugin.app.vault.getAbstractFileByPath(path);
                    if (file && file instanceof TFile) {
                        const leaf = plugin.app.workspace.getLeaf(false);
                        await leaf.openLinkText(path, "");
                        if (leaf.view instanceof MarkdownView) {
                            centerRangeInEditorView(leaf.view.editor, range);
                            addCommentToView(leaf.view.editor.cm, range, false);
                        }
                    }
                });
        });

        if (range.type === SuggestionType.COMMENT) {
            menu.addItem((item) => {
                item.setTitle("Edit comment")
                    .setIcon("pencil")
                    .setSection("comment-handling")
                    .onClick(async () => {
                        // TODO: This is temporary, ideally, this should be handled inside the view
                        const file = plugin.app.vault.getAbstractFileByPath(path);
                        if (file && file instanceof TFile) {
                            const leaf = plugin.app.workspace.getLeaf(false);
                            await leaf.openLinkText(path, "");
                            if (leaf.view instanceof MarkdownView) {
                                const { editor } = leaf.view;
                                centerRangeInEditorView(editor, range);
                                editor.cm.dispatch(editor.cm.state.update({
                                    selection: EditorSelection.cursor(range.full_range_back),
                                    annotations: [
                                        annotationGutterFocusAnnotation.of({
                                            from: range.full_range_back,
                                            to: range.full_range_back,
                                            index: (range as CommentRange).reply_depth,
                                        }),
                                    ],
                                }));
                            }
                        }
                    });
            });

            menu.addItem((item) => {
                item.setTitle("Remove comment")
                    .setIcon("cross")
                    .setSection("comment-handling")
                    .onClick(async () => applyRangeEditsToVault(plugin, ranges, applyToFile.bind(null, (range, _) => ""), false));
            });
        }
    }

    menu.addItem((item) => {
        item
            .setTitle(multiple_ranges ? "Open in new tabs" : "Open in new tab")
            .setIcon("file-plus")
            .setSection("open-annotation")
            .onClick(async (evt) => {
                const grouped_ranges = groupRangeEntryByPath(ranges);

                for (const [path, ranges] of Object.entries(grouped_ranges).slice(0, 10)) {
                    const file = plugin.app.vault.getAbstractFileByPath(path);
                    if (file && file instanceof TFile) {
                        const leaf = plugin.app.workspace.getLeaf(evt.metaKey || evt.ctrlKey || true);
                        await leaf.openLinkText(path, "");
                        if (leaf.view instanceof MarkdownView) {
                            centerRangeInEditorView(leaf.view.editor, ranges[0]);
                        }
                    }
                }
            });
    });


    menu.showAtMouseEvent(e);

    return menu;
}
