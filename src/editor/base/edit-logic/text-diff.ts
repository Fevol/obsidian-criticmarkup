import DiffMatchPatch from "diff-match-patch";
import { create_suggestion } from "../edit-util/range-create";
import type {PluginSettings} from "../../../types";

DiffMatchPatch.DIFF_DELETE = -1;
DiffMatchPatch.DIFF_INSERT = 1;
DiffMatchPatch.DIFF_EQUAL = 0;

export function generateTextDiff(oldText: string, newText: string) {
	const dmp = new DiffMatchPatch();
	const diff = dmp.diff_main(oldText, newText);
	dmp.diff_cleanupSemantic(diff);

	let offset = 0;
	const changes: { from: number; to: number; insert: string }[] = [];
	let current_change: { from: number; to: number; insert: string } | null = null;

	for (const [type, text] of diff) {
		if (type === DiffMatchPatch.DIFF_EQUAL) {
			if (current_change) {
				changes.push(current_change);
				current_change = null;
			}
			offset += text.length;
		} else if (type === DiffMatchPatch.DIFF_INSERT) {
			if (!current_change)
				current_change = { from: offset, to: offset, insert: text };
			else if (!current_change.insert)
				current_change.insert += text;
			else {
				changes.push(current_change);
				current_change = { from: offset, to: offset, insert: text };
			}
		} else if (type === DiffMatchPatch.DIFF_DELETE) {
			if (!current_change)
				current_change = { from: offset, to: offset + text.length, insert: "" };
			else {
				changes.push(current_change);
				current_change = { from: offset, to: offset + text.length, insert: "" };
			}
			offset += text.length;
		}
	}
	if (current_change)
		changes.push(current_change);

	return changes;
}

export function generateCriticMarkupPatchFromDiff(settings: PluginSettings, oldText: string, newText: string) {
	const diff = generateTextDiff(oldText, newText);
	let output = "";
	let offset = 0;
	for (const change of diff) {
		if (change.from > offset)
			output += oldText.slice(offset, change.from);
		if (change.insert)
			output += create_suggestion(settings, change.insert, oldText.slice(change.from, change.to));
		offset = change.to;
	}
	if (offset < oldText.length)
		output += oldText.slice(offset);

	return output;
}
