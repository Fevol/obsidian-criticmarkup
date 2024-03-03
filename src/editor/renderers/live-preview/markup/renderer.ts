import {EditorSelection, type Extension, Range, RangeSet, StateField, Transaction} from '@codemirror/state';
import {Decoration, type DecorationSet, EditorView} from '@codemirror/view';

import {editorLivePreviewField} from 'obsidian';

import {CriticMarkupRange, rangeParser, SubstitutionRange, SuggestionType} from '../../../base';
import {EditMode, type PluginSettings, PreviewMode} from '../../../../types';
import {editModeValueState, previewModeState} from "../../../settings";

function hideBracket(decorations: Range<Decoration>[], range: CriticMarkupRange, left: boolean, is_livepreview: boolean) {
	if (!is_livepreview) return;
	const decoration = Decoration.replace({
		attributes: { 'data-contents': 'string' },
	});

	if (left)
		decorations.push(decoration.range(range.from, range.from + 3));
	else
		decorations.push(decoration.range(range.to - 3, range.to));
}

function hideMetadata(decorations: Range<Decoration>[], range: CriticMarkupRange, is_livepreview: boolean = false) {
	if (!range.metadata || !is_livepreview) return;

	decorations.push(
		Decoration.replace({
			attributes: { 'data-contents': 'string' },
		}).range(range.from + 3, range.metadata + 2),
	);
}

function hideRange(decorations: Range<Decoration>[], range: CriticMarkupRange) {
	decorations.push(
		Decoration.replace({}).range(range.from, range.to),
	);
}

function markContents(decorations: Range<Decoration>[], range: CriticMarkupRange, cls: string, left: boolean | null = null, inclusive = false, apply_styling = true) {
	const offset = inclusive ? 0 : 3;

	if (range.replies.length)
		cls += ' criticmarkup-has-reply';


	const attributes = {
		'data-contents': 'string',
		'data-type': 'criticmarkup-' + range.repr.toLowerCase(),
		'class': cls,
		'style': apply_styling && range.fields.color ? `background-color: #${range.fields.color};` : '',
	}

	const decoration = Decoration.mark({ attributes });

	if (range.type === SuggestionType.SUBSTITUTION) {
		if (left) {
			if (!range.part_is_empty(true))
				decorations.push(decoration.range(range.from + offset, (range as SubstitutionRange).middle));
		} else {
			if (!range.part_is_empty(false))
				decorations.push(decoration.range((range as SubstitutionRange).middle + 2, range.to - offset));
		}
	} else if (!range.empty()) {
		decorations.push(decoration.range(range.from + offset, range.to - offset));
	}
}

function hideSyntax(decorations: Range<Decoration>[], range: CriticMarkupRange, style: string = '', is_livepreview: boolean) {
	hideBracket(decorations, range, true, is_livepreview);
	hideMetadata(decorations, range, is_livepreview);
	markContents(decorations, range, style);
	hideBracket(decorations, range, false, is_livepreview);
}


function constructMarkings(ranges: CriticMarkupRange[], selections: EditorSelection, live_preview: boolean, preview_mode: PreviewMode, suggest_mode: EditMode, settings: PluginSettings): Range<Decoration>[] {
	const decorations: Range<Decoration>[] = [];
	for (const range of ranges) {
		if (preview_mode === PreviewMode.ALL) {
			const in_range = selections.ranges.some(sel_range => range.partially_in_range(sel_range.from, sel_range.to));

			const style = `criticmarkup-editing criticmarkup-inline criticmarkup-${range.repr.toLowerCase()} ` + (range.fields.style || '');

			if (suggest_mode === EditMode.SUGGEST && in_range) {
				markContents(decorations, range, settings.editor_styling ? style : '', null, true, settings.editor_styling);
			} else if (range.type === SuggestionType.SUBSTITUTION) {
				hideBracket(decorations, range, true, live_preview);
				hideMetadata(decorations, range, live_preview);
				markContents(decorations, range, style + ' criticmarkup-deletion', true);
				if (live_preview) {
					decorations.push(
						Decoration.replace({
							attributes: { 'data-contents': 'string' },
						}).range((range as SubstitutionRange).middle, (range as SubstitutionRange).middle + 2),
					);
				}
				markContents(decorations, range, style + ' criticmarkup-addition', false);
				hideBracket(decorations, range, false, live_preview);
			} else {
				hideSyntax(decorations, range, style, live_preview);
			}
		} else if (preview_mode === PreviewMode.ACCEPT) {
			if (range.type === SuggestionType.ADDITION) {
				hideSyntax(decorations, range, 'criticmarkup-accepted', live_preview);
			} else if (range.type === SuggestionType.DELETION) {
				hideRange(decorations, range);
			} else if (range.type === SuggestionType.SUBSTITUTION) {
				hideBracket(decorations, range, true, live_preview);
				hideMetadata(decorations, range, live_preview);
				markContents(decorations, range, 'criticmarkup-accepted', true);
				decorations.push(Decoration.replace({}).range((range as SubstitutionRange).middle, range.to));
			} else {
				hideSyntax(decorations, range, '', live_preview);
			}
		} else if (preview_mode === PreviewMode.REJECT) {
			if (range.type === SuggestionType.ADDITION) {
				hideRange(decorations, range);
			} else if (range.type === SuggestionType.DELETION) {
				hideBracket(decorations, range, true, live_preview);
				hideMetadata(decorations, range, live_preview);
				markContents(decorations, range, 'criticmarkup-accepted');
				hideBracket(decorations, range, false, live_preview);
			} else if (range.type === SuggestionType.SUBSTITUTION) {
				decorations.push(Decoration.replace({}).range(range.from, (range as SubstitutionRange).middle + 2));
				markContents(decorations, range, 'criticmarkup-accepted', false);
				hideBracket(decorations, range, false, live_preview);
			} else {
				hideSyntax(decorations, range, '', live_preview);
			}
		}
	}
	return decorations;
}


/**
 * Extension providing styling for the markup and implementation for the preview modes within the Live Preview editor
 * @remark A StateField approach is required due to the fact that hiding/removing text in preview can go beyond the viewport,
 * which does not mesh with the ViewPlugin philosophy
 * @warning Massive slowdown of editor performance when having many CM markings in a single file (>10k),
 * no obvious solutions possible, document scrolling is not affected
 */
export const markupRenderer = (settings: PluginSettings) => StateField.define<DecorationSet>({
	create(state): DecorationSet {
		return Decoration.none;
	},

	update(oldSet: DecorationSet, tr: Transaction) {
		const livepreview = tr.state.field(editorLivePreviewField);
		const livepreview_changed = livepreview !== tr.startState.field(editorLivePreviewField);
		const preview_mode = tr.state.facet(previewModeState);
		const preview_mode_changed = preview_mode !== tr.startState.facet(previewModeState);
		const suggest_mode = tr.state.facet(editModeValueState);

		if (!tr.docChanged && oldSet.size && !livepreview_changed && !preview_mode_changed) return oldSet;

		const parsed_ranges = tr.state.field(rangeParser);

		if (livepreview_changed || preview_mode_changed) {
			return RangeSet.of<Decoration>(constructMarkings(parsed_ranges.ranges.ranges, tr.state.selection, livepreview, preview_mode, suggest_mode, settings));
		} else {
			return oldSet.map(tr.changes)
				.update({
					filter: (from, to, value) => {
						return !tr.changes.touchesRange(from, to);
					},
					add: constructMarkings(parsed_ranges.inserted_ranges, tr.state.selection, livepreview, preview_mode, suggest_mode, settings)
				});
		}
	},

	provide(field: StateField<DecorationSet>): Extension {
		return EditorView.decorations.from(field);
	},
});
