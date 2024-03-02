import {type Extension, Range, StateField, Transaction} from '@codemirror/state';
import {Decoration, type DecorationSet, EditorView} from '@codemirror/view';

import {editorLivePreviewField} from 'obsidian';

import {CriticMarkupRange, rangeParser, SubstitutionRange, SuggestionType} from '../../../base';
import {type PluginSettings, PreviewMode} from '../../../../types';

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
		if (!tr.docChanged && oldSet.size && tr.state.field(editorLivePreviewField) === tr.startState.field(editorLivePreviewField)) return oldSet;

		const is_livepreview = tr.state.field(editorLivePreviewField);
		const ranges = tr.state.field(rangeParser).ranges;

		// const builder = new RangeSetBuilder<Decoration>();
		const decorations: Range<Decoration>[] = [];

		for (const range of ranges.ranges) {
			if (settings.preview_mode === PreviewMode.ALL) {
				const in_range = tr.selection?.ranges?.some(sel_range => range.partially_in_range(sel_range.from, sel_range.to));

				const style = `criticmarkup-editing criticmarkup-inline criticmarkup-${range.repr.toLowerCase()} ` + (range.fields.style || '');

				if (!settings.suggest_mode && in_range) {
					markContents(decorations, range, settings.editor_styling ? style : '', null, true, settings.editor_styling);
				} else if (range.type === SuggestionType.SUBSTITUTION) {
					hideBracket(decorations, range, true, is_livepreview);
					hideMetadata(decorations, range, is_livepreview);
					markContents(decorations, range, style + ' criticmarkup-deletion', true);
					if (is_livepreview) {
						decorations.push(
							Decoration.replace({
								attributes: { 'data-contents': 'string' },
							}).range((range as SubstitutionRange).middle, (range as SubstitutionRange).middle + 2),
						);
					}
					markContents(decorations, range, style + ' criticmarkup-addition', false);
					hideBracket(decorations, range, false, is_livepreview);
				} else {
					hideSyntax(decorations, range, style, is_livepreview);
				}
			} else if (settings.preview_mode === PreviewMode.ACCEPT) {
				if (range.type === SuggestionType.ADDITION) {
					hideSyntax(decorations, range, 'criticmarkup-accepted', is_livepreview);
				} else if (range.type === SuggestionType.DELETION) {
					hideRange(decorations, range);
				} else if (range.type === SuggestionType.SUBSTITUTION) {
					hideBracket(decorations, range, true, is_livepreview);
					hideMetadata(decorations, range, is_livepreview);
					markContents(decorations, range, 'criticmarkup-accepted', true);
					decorations.push(Decoration.replace({}).range((range as SubstitutionRange).middle, range.to));
				} else {
					hideSyntax(decorations, range, '', is_livepreview);
				}
			} else if (settings.preview_mode === PreviewMode.REJECT) {
				if (range.type === SuggestionType.ADDITION) {
					hideRange(decorations, range);
				} else if (range.type === SuggestionType.DELETION) {
					hideBracket(decorations, range, true, is_livepreview);
					hideMetadata(decorations, range, is_livepreview);
					markContents(decorations, range, 'criticmarkup-accepted');
					hideBracket(decorations, range, false, is_livepreview);
				} else if (range.type === SuggestionType.SUBSTITUTION) {
					decorations.push(Decoration.replace({}).range(range.from, (range as SubstitutionRange).middle + 2));
					markContents(decorations, range, 'criticmarkup-accepted', false);
					hideBracket(decorations, range, false, is_livepreview);
				} else {
					hideSyntax(decorations, range, '', is_livepreview);
				}
			}
		}
		return Decoration.set(decorations);
	},

	provide(field: StateField<DecorationSet>): Extension {
		return EditorView.decorations.from(field);
	},
});
