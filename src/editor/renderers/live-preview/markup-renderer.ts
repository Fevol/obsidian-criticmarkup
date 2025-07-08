import {type EditorSelection, type Extension, Range, RangeSet, StateField, Transaction} from "@codemirror/state";
import {Decoration, type DecorationSet, EditorView} from "@codemirror/view";
import {editorLivePreviewField} from "obsidian";

import {CriticMarkupRange, rangeParser, SubstitutionRange, SuggestionType} from "../../base";
import {editModeValueState, fullReloadEffect, previewModeState} from "../../settings";
import {EditMode, type PluginSettings, PreviewMode} from "../../../types";
import {CommentIconWidget} from "./comment-widget";

const hideMarkupDecoration = Decoration.replace({});
const rangeMarkupDecoration = (range: CriticMarkupRange, cls: string = "", show_styling: boolean = false) => Decoration.mark({
    attributes: {
        "data-contents": "string",
        "data-type": "cmtr-" + range.repr.toLowerCase(),
        "class": cls,
        "style": show_styling && range.fields.color ? `background-color: #${range.fields.color};` : "",
    },
});


function hideBracket(
    decorations: Range<Decoration>[],
    range: CriticMarkupRange,
    side: -1 | 0 | 1,
    show_syntax: boolean = false,
) {
    if (show_syntax) return;

    if (side === -1)
        decorations.push(hideMarkupDecoration.range(range.from, range.from + 3));
    else if (side === 1)
        decorations.push(hideMarkupDecoration.range(range.to - 3, range.to));
    else
        decorations.push(hideMarkupDecoration.range((range as SubstitutionRange).middle, (range as SubstitutionRange).middle + 2));
}

function hideMetadata(
    decorations: Range<Decoration>[],
    range: CriticMarkupRange,
    show_metadata: boolean = false
) {
    if (!range.metadata || show_metadata) return;

    decorations.push(hideMarkupDecoration.range(range.from + 3, range.metadata + 2));
}

function hideRange(decorations: Range<Decoration>[], range: CriticMarkupRange) {
    decorations.push(hideMarkupDecoration.range(range.from, range.to));
}

function markContents(
    decorations: Range<Decoration>[],
    range: CriticMarkupRange,
    cls: string,
    left: number = 0,
    inclusive = false,
    show_styling = true,
) {
    const offset = inclusive ? 0 : 3;

    if (left === 0) {
        if (!range.empty()) {
            decorations.push(rangeMarkupDecoration(range, cls, show_styling)
                .range(range.from + offset, range.to - offset));
        }
    } else {
        if (left < 0) {
            if (!range.part_is_empty(true)) {
                decorations.push(rangeMarkupDecoration(range, cls, show_styling)
                    .range(range.from + offset, (range as SubstitutionRange).middle));
            }
        } else if (left > 0) {
            if (!range.part_is_empty(false)) {
                decorations.push(rangeMarkupDecoration(range, cls, show_styling)
                    .range((range as SubstitutionRange).middle + 2, range.to - offset));
            }
        }
    }
}

function hideSyntax(
    decorations: Range<Decoration>[],
    range: CriticMarkupRange,
    style: string = ""
) {
    hideBracket(decorations, range, -1);
    hideMetadata(decorations, range);
    markContents(decorations, range, style);
    hideBracket(decorations, range, 1);
}

export function constructDecorations(
    ranges: CriticMarkupRange[],
    selections: EditorSelection | null,
    preview_mode: PreviewMode,
    edit_mode: EditMode,
    settings: PluginSettings,
) {

    const decorations: Range<Decoration>[] = [];
    const { show_styling, show_syntax, show_metadata, show_comment } = settings.markup_focus[edit_mode];

    for (const range of ranges) {
        // TODO: Check if 'in focus' status should also be applicable when in some kind of preview mode
        //      Currently, the assumption is made that 'preview' is ONLY for viewing the end result,
        //      any comments, stylings, etc, should _not_ be shown.

        if (preview_mode === PreviewMode.ALL) {
            // TODO: This check might be bypassed if a guarantee can be made on whether the ranges passed
            //       are always in a selection if 'selections' is not null
            const in_range = selections ? selections.ranges.some(sel_range =>
                range.partially_in_full_range(sel_range.from, sel_range.to)
            ) : undefined;

            let style = `cmtr-inline cmtr-${range.repr.toLowerCase()} ` + (range.fields.style || "")
            if (range.replies.length) {
                style += " cmtr-has-reply";
            }

            // TODO: This could be better (but I didn't necessarily want to create two separate code paths)
            const range_show_syntax = in_range ? show_syntax : undefined,
                range_show_metadata = in_range ? show_metadata : undefined,
                range_show_styling = in_range ? show_styling : undefined;


            if (!(show_comment && in_range) && range.type === SuggestionType.COMMENT && settings.comment_style !== "inline") {
                if (settings.comment_style === "icon" && range.base_range === range) {
                    // EXPL: Comment ranges are only shown as icons in live preview mode
                    decorations.push(
                        Decoration.replace({
                            widget: new CommentIconWidget(range, settings.annotation_gutter),
                        }).range(range.from, range.to),
                    );
                } else {
                    // EXPL: Either the comment is not the top of a range, or it is hidden by comment_style = "none"
                    decorations.push(
                        Decoration.replace({}).range(range.from, range.to),
                    );
                }
            } else {
                hideBracket(decorations, range, -1, range_show_syntax);
                hideMetadata(decorations, range, range_show_metadata);
                if (range.type === SuggestionType.SUBSTITUTION) {
                    markContents(decorations, range, style + " cmtr-deletion", -1, false, range_show_styling);
                    hideBracket(decorations, range, 0, range_show_syntax);
                    markContents(decorations, range, style + " cmtr-addition", 1, false, range_show_styling);
                } else {
                    markContents(decorations, range, style, 0, false, range_show_styling);
                }
                hideBracket(decorations, range, 1, range_show_syntax);
            }
        }

        else if (preview_mode === PreviewMode.ACCEPT) {
            if (range.type === SuggestionType.ADDITION)
                hideSyntax(decorations, range, "cmtr-accepted");
            else if (range.type === SuggestionType.DELETION)
                hideRange(decorations, range);
            else if (range.type === SuggestionType.SUBSTITUTION) {
                hideBracket(decorations, range, -1);
                hideMetadata(decorations, range);
                hideBracket(decorations, range, 0);
                markContents(decorations, range, "cmtr-accepted", 1);
                hideBracket(decorations, range, 1);
            } else if (range.type === SuggestionType.COMMENT) {
                hideRange(decorations, range);
            } else {
                hideSyntax(decorations, range, "");
            }
        }

        else if (preview_mode === PreviewMode.REJECT) {
            if (range.type === SuggestionType.ADDITION)
                hideRange(decorations, range);
            else if (range.type === SuggestionType.DELETION) {
                hideBracket(decorations, range, -1);
                hideMetadata(decorations, range);
                markContents(decorations, range, "cmtr-accepted");
                hideBracket(decorations, range, 1);
            } else if (range.type === SuggestionType.SUBSTITUTION) {
                hideBracket(decorations, range, -1);
                hideMetadata(decorations, range);
                markContents(decorations, range, "cmtr-accepted", -1);
                hideBracket(decorations, range, 0);
                hideBracket(decorations, range, 1);
            } else if (range.type === SuggestionType.COMMENT) {
                hideRange(decorations, range);
            } else {
                hideSyntax(decorations, range, "");
            }
        }
    }

    return decorations;


}

export const livepreviewRenderer = (settings: PluginSettings) =>
    StateField.define<DecorationSet>({
        create(state): DecorationSet {
            const live_preview = state.field(editorLivePreviewField);

            // EXPL: No live preview, no decorations
            if (!live_preview) {
                return Decoration.none;
            }

            const preview_mode = state.facet(previewModeState);
            const edit_mode = state.facet(editModeValueState);

            const parsed_ranges = state.field(rangeParser);

            return RangeSet.of<Decoration>(
                constructDecorations(
                    parsed_ranges.ranges.ranges,
                    /*state.selection*/ null,
                    preview_mode,
                    edit_mode,
                    settings,
                ),
            );
        },

        update(oldSet: DecorationSet, tr: Transaction) {
            const live_preview = tr.state.field(editorLivePreviewField);

            // EXPL: NO LIVE PREVIEW (source mode rendering)
            if (!live_preview) {
                return Decoration.none;
            }

            const preview_mode = tr.state.facet(previewModeState);
            const edit_mode = tr.state.facet(editModeValueState);

            const parsed_cm_ranges = tr.state.field(rangeParser);

            // EXPL: SETTING CHANGES
            //  All decorations need to be reloaded
            //     - Switching between live preview and source rendering
            //     - Switching annotation preview modes
            //     - Settings change (indicated by fullReloadEffect)
            if (
                live_preview !== tr.startState.field(editorLivePreviewField) ||
                preview_mode !== tr.startState.facet(previewModeState) ||
                tr.effects.some(e => e.is(fullReloadEffect))
            ) {
                return RangeSet.of<Decoration>(
                    constructDecorations(
                        parsed_cm_ranges.ranges.ranges,
                        tr.state.selection,
                        preview_mode,
                        edit_mode,
                        settings,
                    ),
                );
            }

            // EXPL: CONTENT CHANGES
            //          Only update decorations that are in the changed range (typing, deleting, etc.)
            if (tr.docChanged || (!tr.docChanged && parsed_cm_ranges.inserted_ranges.length)) {
                let range_filter_idx= 0;

                // FIXME: This _might_ be broken
                return oldSet.update({
                    filter: (from, to, _) => {
                        while (range_filter_idx < parsed_cm_ranges.deleted_ranges.length && parsed_cm_ranges.deleted_ranges[range_filter_idx].to <= from) {
                            range_filter_idx++;
                        }
                        const range = parsed_cm_ranges.deleted_ranges[range_filter_idx];
                        return !(range && from < range.to && range.from < to);
                    },
                }).map(tr.changes).update({
                    add: constructDecorations(
                        parsed_cm_ranges.inserted_ranges,
                        tr.state.selection,
                        preview_mode,
                        edit_mode,
                        settings,
                    ),
                });
            }

            // EXPL: SELECTION CHANGES
            //          Only update decorations that are in the old and new selection
            // PERF: 2-6ms for every selectionchange on stresstest (redrawing all decorations takes 12ms)
            //		 0.01-0.05ms for regular small notes
            //       Largest performance impact is from the `update.filter` method, which takes 90% of the time
            if (tr.newSelection !== tr.startState.selection) {
                // EXPL: Combine all old and new selections into one single selection range
                let all_selection_ranges = tr.newSelection;
                for (const range of tr.startState.selection.ranges) {
                    all_selection_ranges = all_selection_ranges.addRange(range);
                }

                const cm_ranges_in_selections = parsed_cm_ranges.ranges.ranges_in_intervals(all_selection_ranges.ranges as unknown as {
                    from: number,
                    to: number
                }[]);

                let range_filter_idx = 0;
                return oldSet.map(tr.changes).update({
                    filter: (from, to, _) => {
                        while (range_filter_idx < cm_ranges_in_selections.length && cm_ranges_in_selections[range_filter_idx].to <= from) {
                            range_filter_idx++;
                        }
                        const range = cm_ranges_in_selections[range_filter_idx];
                        return !(range && from < range.to && range.from < to);
                    },
                    add: constructDecorations(
                        cm_ranges_in_selections,
                        tr.newSelection,
                        preview_mode,
                        edit_mode,
                        settings,
                    ),
                });
            }

            // EXPL: NO CHANGES
            return oldSet;
        },

        provide(field: StateField<DecorationSet>): Extension {
            return EditorView.decorations.from(field);
        },
    });
