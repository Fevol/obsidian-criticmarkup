/**
 * This is almost identical to the gutter defined in @codemirror/view/gutter,
 * with the exception of having the gutter be correctly hidden when there are no suggestions in the note
 */
import { type Extension, Facet } from "@codemirror/state";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { rangeParser } from "../../../base";
import { hideEmptySuggestionGutterState } from "../../../settings";
import {
	createGutter,
	createGutterViewPlugin,
	type GutterConfig,
	GutterView,
	SingleGutterView,
} from "../base";
import { suggestionGutterCompartment } from "./index";

const unfixGutters = Facet.define<boolean, boolean>({
	combine: values => values.some(x => x),
});

const activeGutters = Facet.define<Required<GutterConfig>>();

class SuggestionGutterView extends GutterView {
	constructor(view: EditorView) {
		super(view, unfixGutters, activeGutters);

		// FIXME: this still causes a layout shift
		if (!view.dom.parentElement!.classList.contains("markdown-source-view")) {
			// Prevent gutter from appearing for a brief second (until setImmediate kicks in)
			this.dom.style.display = 'none';
			// Codemirror doesn't allow state changes during updates, so reconfiguration needs to be delayed
			setImmediate(() => {
				view.dispatch(view.state.update({
					effects: [
						suggestionGutterCompartment.reconfigure([])
					]
				}));
			});
		}
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

		if (view.state.facet(hideEmptySuggestionGutterState))
			this.hide_on_empty = true;
	}

	update(update: ViewUpdate) {
		const result = super.update(update);

		const hide_on_empty = update.state.facet(hideEmptySuggestionGutterState);
		if (hide_on_empty !== update.startState.facet(hideEmptySuggestionGutterState))
			this.hide_on_empty = hide_on_empty;

		if (this.showing && this.hide_on_empty && update.state.field(rangeParser).ranges.empty()) {
			this.dom.parentElement!.classList.add("gutter-hidden");
			this.showing = false;
		} else if (!this.showing && (!this.hide_on_empty || !update.state.field(rangeParser).ranges.empty())) {
			this.dom.parentElement!.classList.remove("gutter-hidden");
			this.showing = true;
		}

		return result;
	}
}

const suggestionGutterView = createGutterViewPlugin(SuggestionGutterView);

export function suggestion_gutter(config: GutterConfig): Extension {
	return createGutter(suggestionGutterView, config, activeGutters, unfixGutters);
}
