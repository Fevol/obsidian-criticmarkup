import { type MarkdownPostProcessorContext } from 'obsidian';
import { decodeHTML, DecodingMode } from 'entities';

import { type PluginSettings } from '../../../types';

import {
	SuggestionType, type CriticMarkupRange, SubstitutionRange,
	RANGE_PROTOTYPE_MAPPER, CM_All_Brackets,
	getRangesInText,
} from '../../base';

export async function postProcess(el: HTMLElement, ctx: MarkdownPostProcessorContext, settings: PluginSettings) {
	let ranges_in_range: CriticMarkupRange[] | null = null;
	let start_char: number | null = null, end_char: number | null = null;

	// Undo HTML encoding of specific characters
	let element_contents = decodeHTML(el.innerHTML, DecodingMode.Strict);

	if (ctx) {
		const lines = ctx.getSectionInfo(el);
		if (lines) {
			const all_ranges = getRangesInText(lines.text);

			// We have access to the endlines, so we can determine which range(s) the element belongs to
			const endlines = [...lines.text.matchAll(/\n/g)].map((m) => m.index!);

			start_char = !lines.lineStart ? 0 : endlines[lines.lineStart - 1] + 1;
			end_char = endlines[lines.lineEnd] ?? lines.text.length;

			// TODO: Compare with converting to IntervalTree and getting range (probably slower)
			// ranges_in_range = all_ranges.ranges_in_range(start_char, end_char, true);
			ranges_in_range = all_ranges.filter(range => range.partially_in_range(start_char!, end_char!));

			if (!ranges_in_range.length) return;

			// Potential check: element is entirely enclosed by a single range
			if (ranges_in_range.length === 1) {
				const range = ranges_in_range[0];
				let in_range = false;
				let left: boolean | null = null;
				if (range.type === SuggestionType.SUBSTITUTION) {
					// Determines whether range belongs to the left or right part of the substitution
					if (range.part_encloses_range(start_char, end_char, true) && (in_range = true, left = true)) {
						/* ... */
					} else if (range.part_encloses_range(start_char, end_char, false) && (in_range = true, left = false)) {
						/* ... */
					}
				} else {
					in_range = range.encloses_range(start_char, end_char);
				}

				if (in_range) {
					// TEMPORARY: Remove the ~> from the element contents
					if (range.type === SuggestionType.SUBSTITUTION)
						element_contents = element_contents.replace(/~>/g, '');

					const left_unwrap = start_char === range.from;
					const right_unwrap = end_char === range.to;


					// Remove last occurrence of right bracket
					if (right_unwrap) {
						const last_bracket = element_contents.lastIndexOf(CM_All_Brackets[range.type].at(-1)!);
						element_contents = element_contents.substring(0, last_bracket) + element_contents.substring(last_bracket + 3);
					}

					if (left_unwrap) {
						const first_bracket = element_contents.indexOf(CM_All_Brackets[range.type][0]);
						element_contents = element_contents.substring(0, first_bracket) + element_contents.substring(first_bracket + 3);
					}


					// FIXME: Unwrap is still the issue: find when to remove brackets correctly
					const new_el = range.postprocess(false, settings.default_preview_mode, 'div', left, element_contents);
					if (new_el instanceof HTMLElement) {
						el.innerHTML = "";
						el.appendChild(new_el);
					} else {
						el.innerHTML = new_el;
					}

					return;
				}
			}
		}
	}

	// If code lands here, the element includes a transition of a range (either in/out of a range, or passing middle arrow)

	// Revert markdown rendering of stricken through text and other incorrectly applied markup (that normally would be rendered as <del>...</del>)
	element_contents = element_contents.replaceAll(/{<del>|{<\/del>/g, '{~~')
		.replaceAll(/<del>}|<\/del>}/g, '~~}')
		.replaceAll(/{<mark>|{<\/mark>/g, '{==')
		.replaceAll(/<mark>}|<\/mark>}/g, '==}')
		.replaceAll(/{=<mark>=}|{=<\/mark>=}/g, '{====}');

	// Part of the block is one or more CriticMarkup ranges

	const element_ranges = getRangesInText(element_contents);

	// If markup exists in heading or similar, the text might get duplicated into a data-... field
	// Fix: if two duplicate ranges adjacent to each other, remove the former
	for (let i = 0; i < element_ranges.length - 1; i++) {
		const range = element_ranges[i], next_range = element_ranges[i + 1];
		if (range.equals(next_range)) {
			element_ranges.splice(i, 1);
			i--;
		}
	}


	// No range syntax found in element, and no context was provided to determine whether the element is even part of a noe
	if (!element_ranges.length && !ranges_in_range?.length) return;

	let previous_start = 0, new_element: (HTMLElement | string)[] = []

	// Case where range was opened in earlier block, and closed in current block
	// Parser on element contents will not register the end bracket as a valid range, so we need to manually construct the range
	let missing_range: CriticMarkupRange | null = null;
	let left_outside: boolean | null = null;
	let right_outside: boolean | null = null;
	if (ranges_in_range !== null && element_ranges.length !== ranges_in_range.length) {
		// ..._outside means that range in given direction was not completed with bracket within the block
		left_outside = start_char! > ranges_in_range[0].from;
		right_outside = end_char! < ranges_in_range.at(-1)!.to;
		missing_range = right_outside ? ranges_in_range.at(-1)! : ranges_in_range[0];
	}

	// CASE 1: A ~> B SUBSTITUTION where {~~ and ~~} exist in different blocks
	if (missing_range && left_outside && right_outside && missing_range.type === SuggestionType.SUBSTITUTION) {
		const missing_range_middle = element_contents.indexOf(CM_All_Brackets[SuggestionType.SUBSTITUTION][1]);
		const TempRange = new SubstitutionRange(-Infinity, missing_range_middle, Infinity, element_contents);
		el.innerHTML = TempRange.postprocess(true, settings.default_preview_mode, 'span');
		return;
	}

	// CASE 2: Range for which the start bracket exists in a previous block
	if (missing_range && !right_outside) {
		const missing_range_end = element_contents.indexOf(CM_All_Brackets[missing_range.type].at(-1)!) + 3;

		let TempRange: CriticMarkupRange;
		if (missing_range.type === SuggestionType.SUBSTITUTION) {
			const missing_range_middle = element_contents.indexOf(CM_All_Brackets[SuggestionType.SUBSTITUTION][1]);
			TempRange = new SubstitutionRange(-Infinity, missing_range_middle === -1 ? -Infinity : missing_range_middle, missing_range_end, element_contents);
		} else
			TempRange = new RANGE_PROTOTYPE_MAPPER[missing_range.type](-Infinity, missing_range_end, element_contents);
		new_element.push(TempRange.postprocess(true, settings.default_preview_mode, 'span'));
		previous_start = TempRange.to;
	}

	// DEFAULT: Ranges get processed as normal (ranges which exists completely within the block)
	for (const range of element_ranges) {
		new_element.push(element_contents.slice(previous_start, range.from));
		new_element.push(range.postprocess(true, settings.default_preview_mode, 'span'));
		previous_start = range.to;
	}

	// CASE 3: Range for which the end bracket exists in a later block
	if (missing_range && right_outside) {
		const missing_range_start = element_contents.lastIndexOf(CM_All_Brackets[missing_range.type][0]);

		let TempRange: CriticMarkupRange;
		if (missing_range.type === SuggestionType.SUBSTITUTION)
			TempRange = new SubstitutionRange(0, Infinity, Infinity, element_contents.slice(missing_range_start, -4));
		else
			TempRange = new RANGE_PROTOTYPE_MAPPER[missing_range.type](0, Infinity, element_contents.slice(missing_range_start, -4));
		new_element.push(element_contents.slice(previous_start, missing_range_start));
		new_element.push(TempRange.postprocess(true, settings.default_preview_mode, 'span'));
		previous_start = Infinity;
	}
	new_element.push(element_contents.slice(previous_start));

	el.innerHTML = "";
	const to_reinsert: HTMLElement[] = [];
	let str = "";
	for (const child of new_element) {
		if (typeof child === 'string')
			str += child;
		else {
			str += `<placeholder></placeholder>`;
			to_reinsert.push(child);
		}
	}
	el.innerHTML = str;
	el.querySelectorAll('placeholder').forEach((placeholder, i) => {
		placeholder.replaceWith(to_reinsert[i]);
	});
}
