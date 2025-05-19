/**
 * This file is largely identical to the gutter defined in @codemirror/view/gutter
 * The only changes are:
 *   1. Extracted createGutters/insertGutters/getUpdateContexts methods so they can be overridden
 *   2. Added consts were necessary and formatted code
 *   3. Changed default insert location of the DOM (to be similar to Obsidian's gutter)
 *   4. Extracted activeGutters and unfixGutters Facets so multiple independent gutters can be defined
 */

import { type Extension, Facet, type RangeCursor, RangeSet } from "@codemirror/state";
import {
	BlockInfo,
	BlockType,
	Direction,
	EditorView,
	gutterLineClass,
	GutterMarker,
	ViewPlugin,
	ViewUpdate,
	WidgetType,
} from "@codemirror/view";

// Set EditorView class to have scaleX and scaleY properties
// TODO: REMINDER, uncomment scaleX/scaleY factors when Obsidian updates to upstream CodeMirror
declare module "@codemirror/view" {
	interface EditorView {
		scaleX: number;
		scaleY: number;
	}
}

// Declare that BlockInfo has WidgetType
// TODO: Uncomment widget code when Obsidian updates to upstream CodeMirror
declare module "@codemirror/view" {
	interface WidgetType {
		lang?: string;
	}
}

export function sameMarkers(a: readonly GutterMarker[], b: readonly GutterMarker[]): boolean {
	if (a.length != b.length) return false;
	// @ts-ignore (compare does exist on marker)
	for (let i = 0; i < a.length; i++) if (!a[i].compare(b[i])) return false;
	return true;
}

export type Handlers = { [event: string]: (view: EditorView, line: BlockInfo, event: Event) => boolean };

export interface GutterConfig {
	/** An extra CSS class to be added to the wrapper (`cm-gutter`) element. */
	class?: string;
	/** Controls whether empty gutter elements should be rendered.
	 Defaults to false. */
	renderEmptyElements?: boolean;
	/** Retrieve a set of markers to use in this gutter. */
	markers?: (view: EditorView) => RangeSet<GutterMarker> | readonly RangeSet<GutterMarker>[];
	/** Can be used to optionally add a single marker to every line. */
	lineMarker?: (view: EditorView, line: BlockInfo, otherMarkers: readonly GutterMarker[]) => GutterMarker | null;
	/** Associate markers with block widgets in the document. */
	widgetMarker?: (view: EditorView, widget: WidgetType, block: BlockInfo) => GutterMarker | null;
	/** If line or widget markers depend on additional state, and should
	 * be updated when that changes, pass a predicate here that checks
	 * whether a given view update might change the line markers. */
	lineMarkerChange?: null | ((update: ViewUpdate) => boolean);
	/** Add a hidden spacer element that gives the gutter its base width. */
	initialSpacer?: null | ((view: EditorView) => GutterMarker);
	/** Update the spacer element when the view is updated. */
	updateSpacer?: null | ((spacer: GutterMarker, update: ViewUpdate) => GutterMarker);
	/** Supply event handlers for DOM events on this gutter. */
	domEventHandlers?: Handlers;
}

export const defaults = {
	class: "",
	width: 300,
	renderEmptyElements: false,
	elementStyle: "",
	markers: () => RangeSet.empty,
	lineMarker: () => null,
	widgetMarker: () => null,
	lineMarkerChange: null,
	initialSpacer: null,
	updateSpacer: null,
	domEventHandlers: {},
};

// export function gutter(config: GutterConfig): Extension {
// 	return [gutters(), activeGutters.of({ ...defaults, ...config })];
// }
//
// export function gutters(): Extension {
// 	return [
// 		ViewPlugin.define(view => new GutterView(view)),
// 		gutterLineClass.of(RangeSet.empty),
// 	];
// }

/**
 * Advance cursor to position
 * @param cursor - Cursor to advance
 * @param collect - Array to collect encountered markers in
 * @param pos - Position to advance to
 */
export function advanceCursor(cursor: RangeCursor<GutterMarker>, collect: GutterMarker[], pos: number) {
	while (cursor.value && cursor.from <= pos) {
		// NOTE: Expects range to start *precisely* at the beginning of a line, since advancedCursor is invoked using line.from
		// if (cursor.from == pos) collect.push(cursor.value);

		// MODIFICATION: Instead, all markers up to the current position are collected (so not line-bound)
		if (cursor.from <= pos) collect.push(cursor.value);
		cursor.next();
	}
}

export function asArray<T>(val: T | readonly T[]) {
	return (Array.isArray(val) ? val : [val]) as readonly T[];
}

export class GutterElement {
	dom: HTMLElement;
	height: number = -1;
	above: number = 0;
	markers: readonly GutterMarker[] = [];

	constructor(view: EditorView, height: number, above: number, markers: readonly GutterMarker[]) {
		this.dom = document.createElement("div");
		this.dom.className = "cm-gutterElement";
		this.update(view, height, above, markers);
	}

	update(view: EditorView, height: number, above: number, markers: readonly GutterMarker[]) {
		if (this.height != height) {
			this.height = height;
			this.dom.style.height = height + "px";
		}
		if (this.above != above)
			this.dom.style.marginTop = (this.above = above) ? above + "px" : "";
		if (!sameMarkers(this.markers, markers)) this.setMarkers(view, markers);
	}

	setMarkers(view: EditorView | null, markers: readonly GutterMarker[]) {
		let cls = "cm-gutterElement", domPos = this.dom.firstChild;
		for (let iNew = 0, iOld = 0;;) {
			let skipTo = iOld;
			const marker = iNew < markers.length ? markers[iNew++] : null;
			let matched = false;
			if (marker) {
				const c = marker.elementClass;
				if (c) cls += " " + c;
				for (let i = iOld; i < this.markers.length; i++) {
					// @ts-expect-error (compare does exist on marker)
					if (this.markers[i].compare(marker)) {
						skipTo = i;
						matched = true;
						break;
					}
				}
			} else {
				skipTo = this.markers.length;
			}
			while (iOld < skipTo) {
				const next = this.markers[iOld++];
				if (next.toDOM) {
					if (domPos) {
						// MODF: Prevents unloading of a marker if it used in both old and new GutterElement
						// FIXME: This if-check prevents a re-used Marker (specifically, a marker that is used
						//  	 	in both a old _and_ a new GutterElement) from being completely removed from the DOM
						//		    This needs to be done, as `AnnotationMarker`s are reused across multiple state updates
						// 			via the `annotationGutterMarkers` StateField. If the user changes a annotation in
						//			a single line (which encompasses a GutterElement), all AnnotationMarkers in this
						//			element get removed, and then re-added to the new GutterElement.
						//		A more sane solution would be to change the StateField to construct new Markers
						//		for _all_ markers in a single line, but this requires much more effort.
						if (!(next as any).preventUnload) {
							next.destroy(domPos!);
						}
						(next as any).preventUnload = false;
						// ORIGINAL: next.destroy(domPos!)
						const after = domPos.nextSibling;
						domPos.remove();
						domPos = after;
					}
				}
			}
			if (!marker) break;
			if (marker.toDOM && view) {
				if (matched) domPos = domPos!.nextSibling;
				else this.dom.insertBefore(marker.toDOM(view), domPos);
			}
			if (matched) iOld++;
		}
		this.dom.className = cls;
		this.markers = markers;
	}

	destroy() {
		this.setMarkers(null, []); // The first argument is not used except for creating markers
	}
}

export class UpdateContext {
	cursor: RangeCursor<GutterMarker>;
	i = 0;

	constructor(readonly gutter: SingleGutterView, viewport: { from: number; to: number }, public height: number) {
		this.cursor = RangeSet.iter(gutter.markers, viewport.from);
	}

	/**
	 * Add markers to block
	 * @param view - Current EditorView
	 * @param block - Info of block to which markers should be added
	 * @param markers - Markers to add
	 */
	addElement(view: EditorView, block: BlockInfo, markers: readonly GutterMarker[]) {
		const { gutter } = this;
		const above = block.top - this.height /** / view.scaleY */;
		const height = block.height /** / view.scaleY */;
		if (this.i == gutter.elements.length) {
			const newElt = new GutterElement(view, height, above, markers);
			gutter.elements.push(newElt);
			gutter.dom.appendChild(newElt.dom);
		} else {
			gutter.elements[this.i].update(view, height, above, markers);
		}
		this.height = block.bottom;
		this.i++;
	}

	line(view: EditorView, line: BlockInfo, extraMarkers: readonly GutterMarker[]) {
		let localMarkers: GutterMarker[] = [];

		// advanceCursor will place all GutterMarkers between the last this.cursor position and line.from into localMarkers

		// Widgets that are not part of the same 'viewport' block as the document line block will be skipped
		// See annotation-gutter.ts for a more eloquent, analytical and in-depth explanation
		// MODIFICATION: Markers are collected up until the end of the block
		advanceCursor(this.cursor, localMarkers, line.to);

		// Never happens (related to lineClass)
		if (extraMarkers.length) localMarkers = localMarkers.concat(extraMarkers);

		// Only happens when we set lineMarker in config
		const forLine = this.gutter.config.lineMarker(view, line, localMarkers);
		if (forLine) localMarkers.unshift(forLine);

		const gutter = this.gutter;
		if (localMarkers.length == 0 && !gutter.config.renderEmptyElements) return;
		this.addElement(view, line, localMarkers);
	}

	widget(view: EditorView, block: BlockInfo) {
		// @ts-ignore (Block contains widget)
		const marker = this.gutter.config.widgetMarker(view, block.widget!, block);
		if (marker) this.addElement(view, block, [marker]);
	}

	finish() {
		const gutter = this.gutter;
		// Removes the elements that are outside the viewport (from the bottom, on scroll-up)
		while (gutter.elements.length > this.i) {
			const last = gutter.elements.pop()!;
			gutter.dom.removeChild(last.dom);
			last.destroy();
		}
	}
}

/**
 * 	This class is just a constructor/container of the gutterElements, all the updates
 * 	occur in UpdateContext instead
 *
 * 	Manages:
 * 	 - Marker creation using current view
 * 	 - Checking whether update should be executed on viewport change
 */
export class SingleGutterView {
	dom: HTMLElement;
	elements: GutterElement[] = [];
	markers: readonly RangeSet<GutterMarker>[];
	spacer: GutterElement | null = null;

	constructor(public view: EditorView, public config: Required<GutterConfig>) {
		// Initialised dom for the gutter
		this.dom = document.createElement("div");
		this.dom.className = "cm-gutter" + (this.config.class ? " " + this.config.class : "");
		for (const prop in config.domEventHandlers) {
			this.dom.addEventListener(prop, (event: Event) => {
				let target = event.target as HTMLElement, y;
				if (target != this.dom && this.dom.contains(target)) {
					while (target.parentNode != this.dom) target = target.parentNode as HTMLElement;
					const rect = target.getBoundingClientRect();
					y = (rect.top + rect.bottom) / 2;
				} else {
					y = (event as MouseEvent).clientY;
				}
				const line = view.lineBlockAtHeight(y - view.documentTop);
				if (config.domEventHandlers[prop](view, line, event)) event.preventDefault();
			});
		}

		// Constructs markers as rangeSet
		this.markers = asArray(config.markers(view));
		if (config.initialSpacer) {
			this.spacer = new GutterElement(view, 0, 0, [config.initialSpacer(view)]);
			this.dom.appendChild(this.spacer.dom);
			this.spacer.dom.style.cssText += "visibility: hidden; pointer-events: none";
		}
	}

	update(update: ViewUpdate) {
		const prevMarkers = this.markers;
		this.markers = asArray(this.config.markers(update.view));
		if (this.spacer && this.config.updateSpacer) {
			const updated = this.config.updateSpacer(this.spacer.markers[0], update);
			if (updated != this.spacer.markers[0]) this.spacer.update(update.view, 0, 0, [updated]);
		}
		const vp = update.view.viewport;
		return !RangeSet.eq(this.markers, prevMarkers, vp.from, vp.to) ||
			(this.config.lineMarkerChange ? this.config.lineMarkerChange(update) : false);
	}

	destroy() {
		for (const elt of this.elements) elt.destroy();
	}
}

export class GutterView {
	gutters: SingleGutterView[];
	dom: HTMLElement;
	fixed: boolean;
	prevViewport: { from: number; to: number };

	constructor(
		readonly view: EditorView,
		public unfixGutters: Facet<boolean, boolean>,
		public activeGutters: Facet<Required<GutterConfig>>,
	) {
		this.prevViewport = view.viewport;
		this.dom = document.createElement("div");
		this.dom.className = "cm-gutters";
		this.dom.setAttribute("aria-hidden", "true");
		this.dom.style.minHeight = (this.view.contentHeight /** / this.view.scaleY*/) + "px";
		this.gutters = this.createGutters(view);
		for (const gutter of this.gutters) this.dom.appendChild(gutter.dom);
		this.fixed = !view.state.facet(this.unfixGutters);
		if (this.fixed) {
			// FIXME IE11 fallback, which doesn't support position: sticky,
			// 	by using position: relative + event handlers that realign the
			// 	gutter (or just force fixed=false on IE11?)
			this.dom.style.position = "sticky";
		}
		this.syncGutters(false);
		this.insertGutters(view);
	}

	/**
	 * MODIFICATION: Extracted gutters creation so it can be overridden
	 */
	createGutters(view: EditorView) {
		return view.state.facet(this.activeGutters).map(conf => new SingleGutterView(view, conf));
	}

	// 		const after = this.dom.nextSibling;
	// 			after!.parentNode!.insertBefore(this.dom, after);

	/**
	 * MODIFICATION: Extracted insert method so it can be overridden
	 */
	insertGutters(view: EditorView) {
		view.contentDOM.parentNode!.insertBefore(this.dom, view.contentDOM);
	}

	insertDetachedGutters(after: HTMLElement) {
		after!.parentNode!.insertBefore(this.dom, after);
	}

	getUpdateContexts() {
		return this.gutters.map(gutter =>
			new UpdateContext(gutter, this.view.viewport, -this.view.documentPadding.top)
		);
	}

	update(update: ViewUpdate) {
		// updateGutters executes the viewUpdate on the active gutters
		if (this.updateGutters(update)) {
			// If (and only if) the gutters have changed in a meaningful way -- i.e. markers got removed/added within SingleGutterView
			// Then need to rerender these positions

			/** Detach during sync when the viewport changed significantly
			 * 	(such as during scrolling), since for large updates that is faster.
			 */
			const vpA = this.prevViewport, vpB = update.view.viewport;
			const vpOverlap = Math.min(vpA.to, vpB.to) - Math.max(vpA.from, vpB.from);
			this.syncGutters(vpOverlap < (vpB.to - vpB.from) * 0.8);
		}
		if (update.geometryChanged) this.dom.style.minHeight = this.view.contentHeight + "px";
		if (this.view.state.facet(this.unfixGutters) != !this.fixed) {
			this.fixed = !this.fixed;
			this.dom.style.position = this.fixed ? "sticky" : "";
		}
		this.prevViewport = update.view.viewport;
	}

	syncGutters(detach: boolean) {
		// Detach is almost always true except for the construction of the function (?)

		// after is a hidden element AFTER the gutter containing nothing
		// Not sure what the usage is
		const after = this.dom.nextSibling;

		// Always detach -> Always fully rerender all SingleGutterViews and 'big' gutter
		if (detach) this.dom.remove();

		const lineClasses = RangeSet.iter(this.view.state.facet(gutterLineClass), this.view.viewport.from);
		let classSet: GutterMarker[] = [];

		// Prepares context for each gutter (with individual cursor, height and ...)
		const contexts = this.getUpdateContexts();

		// Loop over all blocks (lines) in the viewport
		for (const line of this.view.viewportLineBlocks) {
			if (classSet.length) classSet = [];

			// ??? If line consists of multiple blocks, does not happen
			if (Array.isArray(line.type)) {
				let first = true;
				for (const b of line.type) {
					if (b.type == BlockType.Text && first) {
						advanceCursor(lineClasses, classSet, b.from);
						for (const cx of contexts)
							cx.line(this.view, b, classSet);
						first = false;
					} else if (b.widget) {
						for (const cx of contexts)
							cx.widget(this.view, b);
					}
				}
			} // If block consists of text
			else if (line.type == BlockType.Text) {
				advanceCursor(lineClasses, classSet, line.from);
				for (const cx of contexts)
					cx.line(this.view, line, classSet);
			}

			// else if (line.widget) {
			// 	for (const cx of contexts)
			// 		cx.widget(this.view, line);
			// }
		}

		// ???
		for (const cx of contexts)
			cx.finish();

		// Re-insert the DOM gutter
		if (detach)
			this.insertDetachedGutters(after as HTMLElement);
	}

	updateGutters(update: ViewUpdate) {
		const prev = update.startState.facet(this.activeGutters);
		const cur = update.state.facet(this.activeGutters);
		let change = update.docChanged || update.heightChanged || update.viewportChanged ||
			!RangeSet.eq(
				update.startState.facet(gutterLineClass),
				update.state.facet(gutterLineClass),
				update.view.viewport.from,
				update.view.viewport.to,
			);
		if (prev == cur) {
			// Updates all gutters, results in syncGutters if change === True
			for (const gutter of this.gutters) {
				if (gutter.update(update))
					change = true;
			}
		} else {
			// This code only executes on gutter being added or removed (specifically: switching source/LP mode?)
			change = true;
			const gutters = [];
			for (const conf of cur) {
				const known = prev.indexOf(conf);
				if (known < 0)
					gutters.push(new SingleGutterView(this.view, conf));
				else {
					this.gutters[known].update(update);
					gutters.push(this.gutters[known]);
				}
			}
			for (const g of this.gutters) {
				g.dom.remove();
				if (gutters.indexOf(g) < 0)
					g.destroy();
			}
			for (const g of gutters)
				this.dom.appendChild(g.dom);
			this.gutters = gutters;
		}
		return change;
	}

	destroy() {
		for (const view of this.gutters) view.destroy();
		this.dom.remove();
	}
}

export function createGutterViewPlugin(cls: { new(view: EditorView): GutterView }) {
	return ViewPlugin.fromClass(cls, {
		provide: plugin =>
			EditorView.scrollMargins.of(view => {
				const value = view.plugin(plugin);
				if (!value || value.gutters.length == 0 || !value.fixed) return null;
				return view.textDirection == Direction.LTR ?
					{ left: value.dom.offsetWidth /** * view.scaleX*/ } :
					{ right: value.dom.offsetWidth /** * view.scaleX*/ };
			}),
	});
}

/** The gutter-drawing plugin is automatically enabled when you add a
 gutter, but you can use this function to explicitly configure it.

 Unless `fixed` is explicitly set to `false`, the gutters are
 fixed, meaning they don't scroll along with the content
 horizontally (except on Internet Explorer, which doesn't support
 CSS [`position:
 sticky`](https://developer.mozilla.org/en-US/docs/Web/CSS/position#sticky)).
 */
export function createGutterExtension(
	viewplugin: ViewPlugin<GutterView>,
	config?: { fixed?: boolean },
	unfixGutters?: Facet<boolean, boolean>,
) {
	const result: Extension[] = [
		viewplugin,
	];
	if (config && config.fixed === false) result.push(unfixGutters!.of(true));
	return result;
}

/** Define an editor gutter. The order in which the gutters appear is
 determined by their extension priority.
 */
export function createGutter(
	viewplugin: ViewPlugin<GutterView>,
	config: GutterConfig,
	activeGutters: Facet<Required<GutterConfig>>,
	unfixGutters: Facet<boolean, boolean>,
) {
	return [createGutterExtension(viewplugin, {}, unfixGutters), activeGutters.of({ ...defaults, ...config })];
}
