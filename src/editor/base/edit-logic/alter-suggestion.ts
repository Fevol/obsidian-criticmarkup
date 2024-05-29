import { type ChangeSpec, EditorState } from "@codemirror/state";

import { App, type TFile } from "obsidian";

import { applyToText, rangeParser } from "../edit-util";
import { CriticMarkupRange, SuggestionType } from "../ranges";

export function acceptSuggestions(state: EditorState, from?: number, to?: number): ChangeSpec[] {
	const range_field = state.field(rangeParser).ranges;
	return ((from || to) ? range_field.ranges_in_range(from ?? 0, to ?? Infinity) : range_field.ranges)
		.filter(range =>
			range.type === SuggestionType.ADDITION || range.type === SuggestionType.DELETION ||
			range.type === SuggestionType.SUBSTITUTION
		)
		.map(range => ({ from: range.from, to: range.to, insert: range.accept() }));
}

export async function acceptSuggestionsInFile(app: App, file: TFile, ranges: CriticMarkupRange[]) {
	ranges.sort((a, b) => a.from - b.from);
	const text = await app.vault.cachedRead(file);

	const output = applyToText(text, (range, text) => range.accept()!, ranges);

	await app.vault.modify(file, output);
}

export function rejectSuggestions(state: EditorState, from?: number, to?: number): ChangeSpec[] {
	const range_field = state.field(rangeParser).ranges;
	return ((from || to) ? range_field.ranges_in_range(from ?? 0, to ?? Infinity) : range_field.ranges)
		.filter(range =>
			range.type === SuggestionType.ADDITION || range.type === SuggestionType.DELETION ||
			range.type === SuggestionType.SUBSTITUTION
		)
		.map(range => ({ from: range.from, to: range.to, insert: range.reject() }));
}

export async function rejectSuggestionsInFile(app: App, file: TFile, ranges: CriticMarkupRange[]) {
	ranges.sort((a, b) => a.from - b.from);
	const text = await app.vault.cachedRead(file);

	const output = applyToText(text, (range, text) => range.reject()!, ranges);

	await app.vault.modify(file, output);
}
