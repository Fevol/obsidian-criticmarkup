import { type ChangeSpec, EditorState } from "@codemirror/state";

import type { App, TFile } from "obsidian";

import { applyToText, rangeParser } from "../edit-util";
import { CriticMarkupRange, SuggestionType } from "../ranges";

// TODO: More sophisticated removal handling
export function acceptSuggestions(state: EditorState, from?: number, to?: number, remove_attached_comments: boolean = true): ChangeSpec[] {
	const range_field = state.field(rangeParser).ranges;
	return ((from || to) ? range_field.ranges_in_interval(from ?? 0, to ?? Infinity) : range_field.ranges)
		.filter(range =>
			range.type === SuggestionType.ADDITION || range.type === SuggestionType.DELETION ||
			range.type === SuggestionType.SUBSTITUTION
		)
		.map(range => ({ from: range.from, to: remove_attached_comments ? range.full_range_back : range.to, insert: range.accept() }));
}

export function rejectSuggestions(state: EditorState, from?: number, to?: number, remove_attached_comments: boolean = true): ChangeSpec[] {
	const range_field = state.field(rangeParser).ranges;
	return ((from || to) ? range_field.ranges_in_interval(from ?? 0, to ?? Infinity) : range_field.ranges)
		.filter(range =>
			range.type === SuggestionType.ADDITION || range.type === SuggestionType.DELETION ||
			range.type === SuggestionType.SUBSTITUTION
		)
		.map(range => ({ from: range.from, to: remove_attached_comments ? range.full_range_back : range.to, insert: range.reject() }));
}

export async function applyToFile(
	applyFn: (range: CriticMarkupRange, text: string) => string,
	app: App,
	file: TFile,
	ranges: CriticMarkupRange[],
): Promise<void> {
	ranges.sort((a, b) => a.from - b.from);
	const text = await app.vault.read(file);

	const output = applyToText(text, applyFn, ranges);

	await app.vault.modify(file, output);
}
