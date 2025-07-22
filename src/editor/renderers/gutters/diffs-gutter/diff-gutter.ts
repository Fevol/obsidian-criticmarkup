/**
 * This is almost identical to the gutter defined in @codemirror/view/gutter,
 * with the exception of having the gutter be correctly hidden when there are no suggestions in the note
 */
import {Annotation, type Extension, Facet } from "@codemirror/state";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { rangeParser } from "../../../base";
import {
	createGutter,
	createGutterViewPlugin,
	type GutterConfig,
	GutterView,
	SingleGutterView,
} from "../base";
import { diffGutterCompartment } from "./index";

const unfixGutters = Facet.define<boolean, boolean>({
	combine: values => values.some(x => x),
});

const activeGutters = Facet.define<Required<DiffGutterConfig>>();

export const diffGutterHideEmptyAnnotation = Annotation.define<boolean>();

class DiffGutterView extends GutterView {
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
						diffGutterCompartment.reconfigure([])
					]
				}));
			});
		}
	}

	createGutters(view: EditorView) {
		return view.state.facet(activeGutters).map(conf => new DiffSingleGutterView(view, conf));
	}
}

export interface DiffGutterConfig extends GutterConfig {
	/**
	 * Whether the gutter should be hidden when empty
	 */
	hideOnEmpty: boolean;
}

class DiffSingleGutterView extends SingleGutterView {
	hide_on_empty: boolean = false;
	showing: boolean = true;

	constructor(public view: EditorView, public config: Required<DiffGutterConfig>) {
		super(view, config);
		this.hide_on_empty = config.hideOnEmpty;
	}

	update(update: ViewUpdate) {
		const result = super.update(update);

		for (const transaction of update.transactions) {
			const hide_on_empty = transaction.annotation(diffGutterHideEmptyAnnotation);
			if (hide_on_empty !== undefined) {
				this.hide_on_empty = hide_on_empty;
			}
		}

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

const markGutterView = createGutterViewPlugin(DiffGutterView);

export function diff_gutter(config: GutterConfig): Extension {
	return createGutter(markGutterView, config, activeGutters, unfixGutters);
}
