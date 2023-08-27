import { Facet, type Extension, RangeSet, type RangeCursor } from '@codemirror/state';
import {
	EditorView,
	ViewPlugin,
	ViewUpdate,
	BlockInfo,
	BlockType,
	WidgetType,
	Direction,
	GutterMarker,
} from '@codemirror/view';
import { CommentMarker } from './comment-gutter';


/** Facet used to add a class to all gutter elements for a given line.
 * Markers given to this facet should _only_ define an
 * [`elementclass`](#view.GutterMarker.elementClass), not a
 * [`toDOM`](#view.GutterMarker.toDOM) (or the marker will appear
 in all gutters for the line). */
export const gutterLineClass = Facet.define<RangeSet<GutterMarker>>();

const MARGIN_BETWEEN = 5;

type Handlers = { [event: string]: (view: EditorView, line: BlockInfo, event: Event) => boolean }

interface GutterConfig {
	/** An extra CSS class to be added to the wrapper (`cm-gutter`) element. */
	class?: string
	/** Controls whether empty gutter elements should be rendered.
	 Defaults to false. */
	renderEmptyElements?: boolean
	/** Retrieve a set of markers to use in this gutter. */
	markers?: (view: EditorView) => (RangeSet<GutterMarker> | readonly RangeSet<GutterMarker>[])
	/** Can be used to optionally add a single marker to every line. */
	lineMarker?: (view: EditorView, line: BlockInfo, otherMarkers: readonly GutterMarker[]) => GutterMarker | null
	/** Associate markers with block widgets in the document. */
	widgetMarker?: (view: EditorView, widget: WidgetType, block: BlockInfo) => GutterMarker | null
	/** If line or widget markers depend on additional state, and should
	 * be updated when that changes, pass a predicate here that checks
	 * whether a given view update might change the line markers. */
	lineMarkerChange?: null | ((update: ViewUpdate) => boolean)
	/** Add a hidden spacer element that gives the gutter its base width. */
	initialSpacer?: null | ((view: EditorView) => GutterMarker)
	/** Update the spacer element when the view is updated. */
	updateSpacer?: null | ((spacer: GutterMarker, update: ViewUpdate) => GutterMarker)
	/** Supply event handlers for DOM events on this gutter. */
	domEventHandlers?: Handlers,
}

const defaults = {
	class: '',
	renderEmptyElements: false,
	elementStyle: '',
	markers: () => RangeSet.empty,
	lineMarker: () => null,
	widgetMarker: () => null,
	lineMarkerChange: null,
	initialSpacer: null,
	updateSpacer: null,
	domEventHandlers: {},
};

const activeGutters = Facet.define<Required<GutterConfig>>();

/** Define an editor gutter. The order in which the gutters appear is
 determined by their extension priority. */
export function right_gutter(config: GutterConfig): Extension {
	return [right_gutters(), activeGutters.of({ ...defaults, ...config })];
}

const unfixGutters = Facet.define<boolean, boolean>({
	combine: values => values.some(x => x),
});

/** The gutter-drawing plugin is automatically enabled when you add a
 gutter, but you can use this function to explicitly configure it.

 Unless `fixed` is explicitly set to `false`, the gutters are
 fixed, meaning they don't scroll along with the content
 horizontally (except on Internet Explorer, which doesn't support
 CSS [`position:
 sticky`](https://developer.mozilla.org/en-US/docs/Web/CSS/position#sticky)). */
export function right_gutters(config?: { fixed?: boolean }): Extension {
	const result: Extension[] = [
		gutterView,
	];
	if (config && config.fixed === false) result.push(unfixGutters.of(true));
	return result;
}

const gutterView = ViewPlugin.fromClass(class {
	gutters: SingleGutterView[];
	dom: HTMLElement;
	fixed: boolean;
	prevViewport: { from: number, to: number };

	constructor(readonly view: EditorView) {
		this.prevViewport = view.viewport;
		this.dom = document.createElement('div');
		this.dom.className = 'cm-gutters';
		this.dom.setAttribute('aria-hidden', 'true');
		this.dom.style.minHeight = this.view.contentHeight + 'px';
		this.gutters = view.state.facet(activeGutters).map(conf => new SingleGutterView(view, conf));
		for (const gutter of this.gutters) this.dom.appendChild(gutter.dom);
		this.fixed = !view.state.facet(unfixGutters);
		if (this.fixed) {
			// FIXME IE11 fallback, which doesn't support position: sticky,
			// by using position: relative + event handlers that realign the
			// gutter (or just force fixed=false on IE11?)
			this.dom.style.position = 'sticky';
		}

		this.syncGutters(false);
		// MODIFICATION: Added nextSibling to view.contentDOM
		view.scrollDOM.insertBefore(this.dom, view.contentDOM.nextSibling);
	}

	update(update: ViewUpdate) {
		// updateGutters executes the viewUpdate on the active gutters
		if (this.updateGutters(update)) {
			// If (and only if) the gutters have changed in a meaningful way -- i.e. markers got removed/added within SingleGutterView
			// Then need to rerender these positions

			/** Detach during sync when the viewport changed significantly
			 (such as during scrolling), since for large updates that is faster. */
			const vpA = this.prevViewport, vpB = update.view.viewport;
			const vpOverlap = Math.min(vpA.to, vpB.to) - Math.max(vpA.from, vpB.from);
			this.syncGutters(vpOverlap < (vpB.to - vpB.from) * 0.8);
		}
		if (update.geometryChanged) this.dom.style.minHeight = this.view.contentHeight + 'px';
		if (this.view.state.facet(unfixGutters) != !this.fixed) {
			this.fixed = !this.fixed;
			this.dom.style.position = this.fixed ? 'sticky' : '';
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
		const contexts = this.gutters.map(gutter => new UpdateContext(gutter, this.view.viewport, -this.view.documentPadding.top));

		// Loop over all blocks (lines) in the viewport
		for (const line of this.view.viewportLineBlocks) {
			if (classSet.length) classSet = [];


			// ??? If line consists of multiple blocks, does not happen
			if (Array.isArray(line.type)) {
				let first = true;
				for (const b of line.type) {
					if (b.type == BlockType.Text && first) {
						advanceCursor(lineClasses, classSet, b.from);
						for (const cx of contexts) cx.line(this.view, b, classSet);
						first = false;
					} else if (b.widget) {
						for (const cx of contexts) cx.widget(this.view, b);
					}
				}
			}

			// If block consists of text
			else if (line.type == BlockType.Text) {
				// Advance cursor to line to grab corresponding line classes
				advanceCursor(lineClasses, classSet, line.from);

				// For each gutter update context, call line()
				for (const cx of contexts)
					cx.line(this.view, line, classSet);
			}
		}

		// ???
		for (const cx of contexts)
			cx.finish();

		// Re-insert the DOM gutter
		if (detach) this.view.scrollDOM.insertBefore(this.dom, after);
	}

	updateGutters(update: ViewUpdate) {
		const prev = update.startState.facet(activeGutters), cur = update.state.facet(activeGutters);
		let change = update.docChanged || update.heightChanged || update.viewportChanged ||
			!RangeSet.eq(update.startState.facet(gutterLineClass), update.state.facet(gutterLineClass),
				update.view.viewport.from, update.view.viewport.to);
		if (prev == cur) {
			// Updates all gutters, results in syncGutters if change === True
			for (const gutter of this.gutters) if (gutter.update(update)) change = true;
		} else {
			// This code only executes on gutter being added or removed (specifically: switching source/LP mode?)
			change = true;
			const gutters = [];
			for (const conf of cur) {
				const known = prev.indexOf(conf);
				if (known < 0) {
					gutters.push(new SingleGutterView(this.view, conf));
				} else {
					this.gutters[known].update(update);
					gutters.push(this.gutters[known]);
				}
			}
			for (const g of this.gutters) {
				g.dom.remove();
				if (gutters.indexOf(g) < 0) g.destroy();
			}
			for (const g of gutters) this.dom.appendChild(g.dom);
			this.gutters = gutters;
		}
		return change;
	}

	public moveGutter(marker: GutterMarker) {
		const activeGutter = this.gutters[0]

		const elementIdx = activeGutter.elements.findIndex(element => element.markers.includes(marker));
		if (elementIdx === -1) return;

		const gutterElement = activeGutter.elements[elementIdx];

		const widgetIndex  = gutterElement.markers.indexOf(marker);

		const margin_top = 50

		// @ts-ignore (offsetTop is in the element)
		let offset = gutterElement.dom.children[widgetIndex].offsetTop - gutterElement.block!.top - margin_top;
		if (Math.abs(offset) < 10) offset = 0;
		if (offset) {
			const element = activeGutter.elements[0];
			element.dom.style.marginTop = parseInt(element.dom.style.marginTop || '0') - offset + 'px';
		}
	}

	destroy() {
		for (const view of this.gutters) view.destroy();
		this.dom.remove();
	}
}, {
	provide: plugin => EditorView.scrollMargins.of(view => {
		const value = view.plugin(plugin);
		if (!value || value.gutters.length == 0 || !value.fixed) return null;
		return view.textDirection == Direction.LTR ? { left: value.dom.offsetWidth } : { right: value.dom.offsetWidth };
	}),
});

function asArray<T>(val: T | readonly T[]) {
	return (Array.isArray(val) ? val : [val]) as readonly T[];
}

/**
 * Advance cursor to position
 * @param cursor - Cursor to advance
 * @param collect - Array to collect encountered markers in
 * @param pos - Position to advance to
 */
function advanceCursor(cursor: RangeCursor<GutterMarker>, collect: GutterMarker[], pos: number) {
	while (cursor.value && cursor.from <= pos) {
		if (cursor.from == pos) collect.push(cursor.value);
		cursor.next();
	}
}


class UpdateContext {
	cursor: RangeCursor<GutterMarker>;

	// TODO: Understand i
	i = 0;

	previousEnd: number = 0;

	/**
	 * Amount of padding added to the top of the document
	 */
	height: number = 0;

	constructor(readonly gutter: SingleGutterView, viewport: { from: number, to: number }, height: number) {
		this.cursor = RangeSet.iter(gutter.markers, viewport.from);
		this.height = height;
	}

	/**
	 * Add markers to block
	 * @param view - Current EditorView
	 * @param block - Info of block to which markers should be added
	 * @param markers - Markers to add
	 */
	async addElement(view: EditorView, block: BlockInfo, markers: readonly GutterMarker[]) {
		const { gutter } = this;
		// Above gives the margin between either top of document or bottom previous block
		// const above = block.top < this.height ? this.height : block.top - this.height;
		// const above = block.top - this.height;
		const above = Math.max(block.top - this.height, 0);
		const block_start = block.top < this.height ? this.height : block.top;


		// FIXME: This is very dependant on... well, everything, but at least it kind of works
		// TODO: Find a more robust manner to determine the height of the block
		const char_line_length = 42;
		const line_pixel_height = 18;
		const PADDING = 16;
		const INNER_MARGIN = 6;
		const WIGGLE_ROOM = 0;
		const BORDER_SIZE = 4;
		let height = 0;
		const indiv_heights = [];
		for (const marker of (markers as CommentMarker[])) {
			const node_text = view.state.doc.sliceString(marker.node.from, marker.node.to);
			const num_end_line = node_text.match(/\n/g)?.length || 0;
			const comment_length = marker.node.to - marker.node.from - 6 - num_end_line;
			const num_lines = Math.max(1, Math.ceil(comment_length / char_line_length)) + num_end_line;
			height += num_lines * line_pixel_height + MARGIN_BETWEEN + PADDING + INNER_MARGIN + BORDER_SIZE;
			indiv_heights.push(num_lines * line_pixel_height + MARGIN_BETWEEN + PADDING + INNER_MARGIN);
		}
		height += WIGGLE_ROOM;



		// Constructs element if gutter was initialised from empty
		if (this.i == gutter.elements.length) {
			// Create a new Gutter Element at position
			const newElt = new GutterElement(view, height, above, markers, block);
			gutter.elements.push(newElt);

			gutter.dom.appendChild(newElt.dom);
		}

		// Update element (move up/down) if gutter already exists
		else {
			gutter.elements[this.i].update(view, height, above, markers, block);
		}

		this.height = block_start + height;

		this.i++;
	}

	line(view: EditorView, line: BlockInfo, extraMarkers: readonly GutterMarker[]) {
		let localMarkers: GutterMarker[] = [];
		// advanceCursor will place all GutterMarkers between the last this.cursor position and line.from into localMarkers

		// Widgets that are not part of the same 'viewport' block as the document line block will be skipped
		// See comment-gutter.ts for a more eloquent, analytical and in-depth explanation
		advanceCursor(this.cursor, localMarkers, line.from);

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
		// @ts-ignore
		const marker = this.gutter.config.widgetMarker(view, block.widget!, block);
		if (marker) this.addElement(view, block, [marker]);
	}

	finish() {
		const gutter = this.gutter;
		// ??? While length of gutter elements greater than i, remove last gutter element
		// ??? Removes element if it exists the gutter
		// FIXME: This might cause issues if there are a great many gutter elements
		while (gutter.elements.length > this.i) {
			const last = gutter.elements.pop()!;
			gutter.dom.removeChild(last.dom);
			last.destroy();
		}
	}
}

class SingleGutterView {
	// This class is just a constructor/container of the gutterelements, all the updates in UpdateContext instead
	// Manages:
	//  - Marker creation using current view
	//  - Checking whether update should be executed on viewport change

	dom: HTMLElement;
	elements: GutterElement[] = [];
	markers: readonly RangeSet<GutterMarker>[];
	spacer: GutterElement | null = null;

	constructor(public view: EditorView, public config: Required<GutterConfig>) {
		// Initialised dom for the gutter
		this.dom = document.createElement('div');
		this.dom.className = 'cm-gutter' + (this.config.class ? ' ' + this.config.class : '');
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
			this.spacer = new GutterElement(view, 0, 0, [config.initialSpacer(view)], null);
			this.dom.appendChild(this.spacer.dom);
			this.spacer.dom.style.cssText += 'visibility: hidden; pointer-events: none';
		}
	}

	update(update: ViewUpdate) {
		const prevMarkers = this.markers;
		this.markers = asArray(this.config.markers(update.view));

		// Now we have two sets of markers: prevMarkers and this.markers

		if (this.spacer && this.config.updateSpacer) {
			const updated = this.config.updateSpacer(this.spacer.markers[0], update);
			if (updated != this.spacer.markers[0]) this.spacer.update(update.view, 0, 0, [updated]);
		}
		const vp = update.view.viewport;

		// Boolean returns true only if markers have changed within the viewport (so outside markers don't count)
		return !RangeSet.eq(this.markers, prevMarkers, vp.from, vp.to) ||
			(this.config.lineMarkerChange ? this.config.lineMarkerChange(update) : false);
	}

	destroy() {
		for (const elt of this.elements) elt.destroy();
	}
}

class GutterElement {
	dom: HTMLElement;
	height: number = -1;
	above: number = 0;
	markers: readonly GutterMarker[] = [];
	block: BlockInfo | null = null;

	constructor(view: EditorView, height: number, above: number, markers: readonly GutterMarker[], block: BlockInfo | null) {
		this.dom = document.createElement('div');
		this.dom.className = 'cm-gutterElement';
		this.update(view, height, above, markers);
	}

	update(view: EditorView, height: number, above: number, markers: readonly GutterMarker[], block: BlockInfo | null = null) {
		this.block = block;
		if (this.height != height)
			this.dom.style.height = (this.height = height) + 'px';
		if (this.above != above)
			this.dom.style.marginTop = (this.above = above) ? above + 'px' : '';
		if (!sameMarkers(this.markers, markers)) {
			this.setMarkers(view, markers);
		}
	}

	setMarkers(view: EditorView, markers: readonly GutterMarker[]) {
		let cls = 'cm-gutterElement', domPos = this.dom.firstChild;
		for (let iNew = 0, iOld = 0; ;) {
			let skipTo = iOld, marker = iNew < markers.length ? markers[iNew++] : null, matched = false;
			if (marker) {
				const c = marker.elementClass;
				if (c) cls += ' ' + c;
				for (let i = iOld; i < this.markers.length; i++)
					// @ts-ignore
					if (this.markers[i].compare(marker)) {
						skipTo = i;
						matched = true;
						break;
					}
			} else {
				skipTo = this.markers.length;
			}
			while (iOld < skipTo) {
				const next = this.markers[iOld++];
				if (next.toDOM) {
					next.destroy(domPos!);
					const after = domPos!.nextSibling;
					domPos!.remove();
					domPos = after;
				}
			}
			if (!marker) break;
			if (marker.toDOM) {
				if (matched) domPos = domPos!.nextSibling;
				else {
					const domRendered = marker.toDOM(view);
					// @ts-ignore
					domRendered.style.marginBottom = MARGIN_BETWEEN + "px";
					this.dom.insertBefore(domRendered, domPos);
					// // Get height of domRendered
					// setTimeout(() => {
					// 	// @ts-ignore
					// 	const height = domRendered.clientHeight
					// 	// Parse dom.style.marginTop
					// 	const marginTop = parseInt(this.dom.style.marginTop.slice(0, -2))
					// 	this.dom.style.marginTop = Math.floor(marginTop  - height / 2) + "px"
					//
					// }, 0)
				}
			}
			if (matched) iOld++;
		}
		this.dom.className = cls;
		this.markers = markers;
	}

	destroy() {
		this.setMarkers(null as any, []); // First argument not used unless creating markers
	}
}

/**
 * Checks if two arrays of markers are the same
 */
function sameMarkers(a: readonly GutterMarker[], b: readonly GutterMarker[]): boolean {
	if (a.length != b.length) return false;
	// @ts-ignore
	for (let i = 0; i < a.length; i++) if (!a[i].compare(b[i])) return false;
	return true;
}
