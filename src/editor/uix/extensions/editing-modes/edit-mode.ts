import {EditorSelection, EditorState, type Extension, SelectionRange, Transaction} from '@codemirror/state';
import {type PluginSettings} from '../../../../types';

import {
    cursor_move_range,
    cursorMoved,
    getEditorRanges,
    getUserEvents,
    mark_ranges,
    MarkAction,
    rangeParser,
} from '../../../base';

import {latest_keypress} from "../keypress-catcher";
import {cursor_transaction_pass_syntax} from "./cursor_movement";

function isUserEvent(event: string, events: string[]): boolean {
    return events.some(e => e.startsWith(event));
}


export const editMode = (settings: PluginSettings): Extension => EditorState.transactionFilter.of(tr => applyCorrectedEdit(tr, settings));


function applyCorrectedEdit(tr: Transaction, settings: PluginSettings): Transaction {
    const userEvents = getUserEvents(tr);
    const vim_mode = app.workspace.activeEditor?.editor?.cm.cm !== undefined;

    if (!tr.docChanged && tr.selection && vim_mode) {
        if (cursorMoved(tr))
            userEvents.push(tr.startState.selection.ranges[0].from < tr.selection!.ranges[0].from ? 'select.forward' : 'select.backward');
    }

    // CASE 1: Handle edit operations
    if (tr.docChanged) {
        const changed_ranges = getEditorRanges(tr.startState.selection, tr.changes, tr.startState.doc);

        if (!(tr.isUserEvent('input') || tr.isUserEvent('paste') || tr.isUserEvent('delete')))
            return tr;

        const ranges = tr.startState.field(rangeParser).ranges;
        const changes = [];
        const selections: SelectionRange[] = [];

        const backwards_delete = latest_keypress?.key === "Backspace";
        const group_delete = latest_keypress?.ctrlKey!;
        let offset = 0;
        for (let editor_change of changed_ranges) {
            if (tr.isUserEvent('delete')) {
                editor_change = cursor_move_range(editor_change, ranges, backwards_delete, group_delete, tr.startState,
                    settings.suggestion_mode_operations.cursor_movement, settings.suggestion_mode_operations.bracket_movement);
            }

            if (editor_change.from === editor_change.to) {
                const range = ranges.at_cursor(editor_change.from);
                if (range) {
                    const touches_bracket = range.touches_left_bracket(editor_change.from, false, true, true) ? true :
                                                     range.touches_right_bracket(editor_change.from, false, true) ? false : undefined;
                    if (touches_bracket !== undefined) {
                        const cursor = touches_bracket ? range.from : range.to;
                        changes.push({
                            from: cursor,
                            to: cursor,
                            insert: editor_change.inserted,
                        });
                        offset += editor_change.inserted.length;
                        selections.push(EditorSelection.cursor(cursor + offset));
                        continue;
                    }
                }
            }

            const edits = mark_ranges(ranges, tr.startState.doc, editor_change.from, editor_change.to, editor_change.inserted, MarkAction.REGULAR);
            const added_offset = edits.slice(0, -1).reduce((acc, op) => acc - (op.to - op.from) + op.insert.length, 0);
            if (edits) {
                changes.push(edits);
                selections.push(EditorSelection.cursor((backwards_delete ? edits[0].start : edits[edits.length - 1].end + added_offset) + offset));
                offset += added_offset - (edits[edits.length - 1].to - edits[edits.length - 1].from) + edits[edits.length - 1].insert.length
            }
        }

        return tr.startState.update(changes.length ? { changes, selection: EditorSelection.create(selections)} : {});
    }

    // CASE 2: Handle cursor movements
    else if (isUserEvent('select', userEvents) && cursorMoved(tr) && settings.alternative_cursor_movement /*&& tr.startState.field(editorLivePreviewField)*/) {
        const result = cursor_transaction_pass_syntax(tr, userEvents, vim_mode, settings);
        if (result)
            return tr.startState.update(result);
    }

    return tr;
}
