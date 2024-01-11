/**
 * This is almost identical to the gutter defined in @codemirror/view/gutter,
 * with the exception of having the gutter be correctly hidden when there are no suggestions in the note
 */
import {
	createGutter,
	createGutterViewPlugin,
	type GutterConfig,
	GutterView,
	SingleGutterView,
} from '../base';
import { EditorView, ViewUpdate } from '@codemirror/view';
import { type Extension, Facet } from '@codemirror/state';
import { hideEmptySuggestionGutterEffect, hideEmptySuggestionGutterState } from '../../../settings';
import { rangeParser } from '../../../base';

const unfixGutters = Facet.define<boolean, boolean>({
	combine: values => values.some(x => x),
});

const activeGutters = Facet.define<Required<GutterConfig>>();

class SuggestionGutterView extends GutterView {
	constructor(view: EditorView) {
		super(view, unfixGutters, activeGutters);
	}

	createGutters(view: EditorView) {
		return view.state.facet(activeGutters).map(conf => new SuggestionSingleGutterView(view, conf));
	}
}

class SuggestionSingleGutterView extends SingleGutterView {
	hide_on_empty: boolean = false;
	showing: boolean = true;

	constructor(public view: EditorView, public config: Required<GutterConfig>) {
		super(view, config);

		if (view.state.facet(hideEmptySuggestionGutterState)) {
			this.hide_on_empty = true;
		}
	}

	update(update: ViewUpdate) {
		const result = super.update(update);

		for (const tr of update.transactions) {
			for (const eff of tr.effects) {
				if (eff.is(hideEmptySuggestionGutterEffect)) {
					this.hide_on_empty = eff.value;
					break;
				}
			}
		}

		if (this.showing && this.hide_on_empty && update.state.field(rangeParser).ranges.empty()) {
			this.dom.parentElement!.classList.add('gutter-hidden');
			this.showing = false;
		} else if (!this.showing && (!this.hide_on_empty || !update.state.field(rangeParser).ranges.empty())) {
			this.dom.parentElement!.classList.remove('gutter-hidden');
			this.showing = true;
		}

		return result;
	}
}

const suggestionGutterView = createGutterViewPlugin(SuggestionGutterView);

export function suggestion_gutter(config: GutterConfig): Extension {
	return createGutter(suggestionGutterView, config, activeGutters, unfixGutters);
}
