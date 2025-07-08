import {type CriticMarkupRangeEntry, type CriticMarkupRange, groupRangeEntryByPath} from "../base";
import {type App, type MarkdownView, Notice, TFile} from "obsidian";
import type CommentatorPlugin from "../../main";
import {showProgressBarNotice} from "../../util/obsidian-util";
import {centerRangeInEditorView} from "./editor";


export async function applyRangeEditsToVault(plugin: CommentatorPlugin, ranges: CriticMarkupRangeEntry[], fn: (app: App, file: TFile, value: CriticMarkupRange[]) => Promise<void>, include_replies: boolean = true) {
    const grouped_ranges = groupRangeEntryByPath(ranges);

    const file_history: Record<string, string> = {};
    let progressBarUpdate: ((val: number) => void) = () => {};
    if (Object.keys(grouped_ranges).length >= 100) {
        progressBarUpdate = showProgressBarNotice("Applying operations...", "Operations applied.", Object.keys(grouped_ranges).length, 3000, "Please do not apply other operations until this progress bar has completed.");
    }

    let idx = 0;
    for (let [path, ranges] of Object.entries(grouped_ranges)) {
        const file = plugin.app.vault.getAbstractFileByPath(path);
        if (!file || !(file instanceof TFile)) {
            continue;
        }
        file_history[path] = await plugin.app.vault.cachedRead(file);
        if (include_replies) {
            ranges = ranges.flatMap(range => [range, ...range.replies]);
        }

        ranges.sort((a, b) => a.from - b.from);


        await fn(plugin.app, file, ranges);
        progressBarUpdate(++idx);
    }
    plugin.file_history.push({changes: file_history, mtime: Date.now()});
}

export async function undoRangeEditsToVault(plugin: CommentatorPlugin) {
    if (plugin.file_history.length === 0) {
        new Notice("No changes to undo.", 3000);
        return;
    }

    const last_changes = plugin.file_history.pop();
    if (!last_changes) {
        return;
    }

    const { changes, mtime } = last_changes;
    let progressBarUpdate: ((val: number) => void) = () => {};
    if (Object.keys(changes).length >= 100) {
        progressBarUpdate = showProgressBarNotice("Undoing changes...", "Changes undone.", Object.keys(changes).length, 3000, "Please do not apply other operations until this progress bar has completed.");
    }

    let idx = 0;
    for (const [path, contents] of Object.entries(changes)) {
        const file = plugin.app.vault.getAbstractFileByPath(path);
        if (!file || !(file instanceof TFile)) {
            continue;
        }

        if (file.stat.mtime > mtime) {
            // EXPL: If the file has been modified since the changes were made, skip it
            new Notice("File has been modified since the changes were made, skipping: " + path, 3000);
            continue;
        }

        await plugin.app.vault.modify(file, contents);
        progressBarUpdate(++idx);
    }
}


export async function openNoteAtRangeEntry(plugin: CommentatorPlugin, entry: CriticMarkupRangeEntry) {
    const leaves = plugin.app.workspace.getLeavesOfType("markdown");
    if (!leaves.length) {
        return;
    }
    const lastActiveLeaf = leaves.reduce((a, b) =>
        (a.activeTime ?? 0) > (b.activeTime ?? 0) ? a : b,
    );

    const file = plugin.app.vault.getAbstractFileByPath(entry.path);
    if (!file || !(file instanceof TFile)) {
        return;
    }

    await plugin.app.workspace.revealLeaf(lastActiveLeaf);
    const view = lastActiveLeaf.view as MarkdownView;

    if (file !== view.file) {
        await lastActiveLeaf.openFile(file);
    }

    centerRangeInEditorView(view.editor, entry.range);
}
