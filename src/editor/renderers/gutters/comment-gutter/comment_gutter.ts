/**
 * This gutter is a modified version of the one defined in @codemirror/view/gutter
 * The main changes are:
 *  1. Gutter is inserted next to the contentDOM (instead of before)
 *  2. Height of gutterElement is not specified
 *  3. GutterElement can be of arbitrary height
 *  4. Exposed method for moving the gutter up/down to align with the block it is attached to
 *  5. Gutter *can* be zero-width if there are no markers in the document
 */
import { type Extension, Facet } from '@codemirror/state';
import { EditorView, ViewUpdate, BlockInfo, GutterMarker }  from '@codemirror/view';

import { commentGutterMarkers, CommentMarker } from './marker';
import {
	commentGutterWidthEffect, commentGutterWidthState,
	hideEmptyCommentGutterEffect, hideEmptyCommentGutterState,
} from '../../../settings';
import {
	createGutter, createGutterViewPlugin,
	type GutterConfig, GutterElement, GutterView,
	sameMarkers, SingleGutterView, UpdateContext,
} from '../base';


const unfixGutters = Facet.define<boolean, boolean>({
	combine: values => values.some(x => x),
});

const activeGutters = Facet.define<Required<GutterConfig>>();

class CommentGutterView extends GutterView {
	constructor(view: EditorView) {
		super(view, unfixGutters, activeGutters);
	}

	createGutters(view: EditorView) {
		return view.state.facet(activeGutters).map(conf => new CommentSingleGutterView(view, conf));
	}

	insertGutters(view: EditorView) {
		view.contentDOM.parentNode!.insertBefore(this.dom, view.contentDOM.nextSibling);
	}

	insertDetachedGutters(after: HTMLElement) {
		this.view.contentDOM.parentNode!.insertBefore(this.dom, this.view.contentDOM.nextSibling);
	}

	getUpdateContexts(): UpdateContext[] {
		return (this.gutters as CommentSingleGutterView[]).map(gutter => new CommentUpdateContext(gutter, this.view.viewport, -this.view.documentPadding.top));
	}

	updateGutters(update: ViewUpdate): boolean {
		return super.updateGutters(update);
	}

	/**
	 * Moves gutter element up/down to align with block
	 * @param marker - Marker to align the gutter to
	 */
	public moveGutter(marker: GutterMarker) {
		// We only need to deal with one gutter
		const activeGutter = this.gutters[0]

		// Given the marker, fetch the gutterElement it belongs to
		const elementIdx = activeGutter.elements.findIndex(element => element.markers.includes(marker));
		if (elementIdx === -1) return;

		const gutterElement = activeGutter.elements[elementIdx] as CommentGutterElement;
		const widgetIndex  = gutterElement.markers.indexOf(marker);

		/**
		 * Where the gutter element should be located (i.e. flush with the top of the block)
		 */
		const desiredLocation = gutterElement.block!.top;
		/**
		 * Where the gutter element is currently located (possibly pushed down by other gutter elements)
		 */
		const currentLocation = (gutterElement.dom.children[widgetIndex] as HTMLElement).offsetTop;

		// Determine the offset between the current location and the desired location
		let offset = desiredLocation - currentLocation;


		if (Math.abs(offset) < 10) offset = 0;
		if (offset) {
			const element = activeGutter.elements[0];
			element.dom.style.marginTop = parseInt(element.dom.style.marginTop || '0') + offset + 'px';
		}
	}

	public focusCommentThread(position: number, index: number = -1) {
		// Find element with range in it
		const element = this.gutters[0].elements.find(
			element => (element as CommentGutterElement).block!.from <= position && position <= (element as CommentGutterElement).block!.to
		)

		if (element) {
			const marker = element.markers.find(marker => (marker as CommentMarker).comment_range.cursor_inside(position))! as CommentMarker;
			marker.focus_comment(index);
		}
	}
}

const commentGutterView = createGutterViewPlugin(CommentGutterView);

export function comment_gutter(config: GutterConfig): Extension {
	return createGutter(commentGutterView, config, activeGutters, unfixGutters);
}



class CommentUpdateContext extends UpdateContext {
	/**
	 * Describes the y-position of the bottom of the previous gutter element
	 */
	previous_element_end: number = 0;

	constructor(readonly gutter: CommentSingleGutterView, viewport: { from: number, to: number }, public height: number) {
		super(gutter, viewport, height);
		this.previous_element_end = height;
	}

	async addElement(view: EditorView, block: BlockInfo, markers: readonly GutterMarker[]) {
		const { gutter } = this;

		/**
		 * Describes the amount of space between the previous gutter element and the y-postion for the one that will be constructed for the current block
		 * @remark This prevents the overlap of the gutter elements
		 */
		const above = Math.max(block.top - this.previous_element_end, 0);

		/**
		 * Iff there is overlap with the previous block (i.e. the top of the block is lower than the bottom of the previous gutter element),
		 * then place the gutter element at the bottom of the previous gutter element (above = 0)
		 */
		const block_start = above <= 0 ? this.previous_element_end : block.top;

		/**
		 * SOLUTION: ensures ordering of markers of same block (bit inefficient but very easy solution)
		 * Works by sorting the markers in-place
		 * @todo Investigate whether the markers can be sorted earlier in the pipeline
 		 */
		(markers as CommentMarker[]).sort((a, b) => a.comment_range.from - b.comment_range.from);



		const UNKNOWN_HEIGHT = 36;

		/**
		 * Complete height of the GUTTERELEMENT, including BOTTOM margin (i.e. spacing between gutter elements)
		 * @remark The reason *why* this is an absolutely essential value, is that it ensures that no elements can overlap,
		 *     if estimated height is lower than actual height, then gutterelements of two blocks risk overlapping
		 *     if estimated height is higher than actual height, then gutterelements will have an unnecessarily large gap between them
		 *   however, we cannot directly grab the height of the element, as it is not yet rendered, so we need to either:
		 *   	1. Estimate the height of the element (clunky, and error-prone with different styles)
		 *   	2. Wait till element is rendered, grab height from rendered element
		 * @remark Current implementation relies on the fact that CodeMirror does a second pass through all of the elements,
		 *     at which point the height of the gutter element is known due to the DOM being rendered
		 *     when SyncGutter is called, the height is again reset to 0, which causes desync issues and additional gutter movement
		 * @warning This is THE only part of the algorithm that needs an implementation (a.k.a. the unsettled height problem),
		 * 	   in short, a better approximation for UNKNOWN_HEIGHT when the element is not rendered yet would be fantastic
		 * 	   please - and I mean this with all sincerity in the world - please let me know if you are able to come up with a more elegant solution
		 */
		const height = gutter.elements[this.i]?.dom.clientHeight || UNKNOWN_HEIGHT;

		// ALTERNATIVE FALLBACK HEIGHT CODE (but far too clunky)
		// 		const char_line_length = 42;
		// 		const line_pixel_height = 18;
		// 		const PADDING = 16;
		// 		const INNER_MARGIN = 6;
		// 		const WIGGLE_ROOM = 0;
		// 		const BORDER_SIZE = 4;
		// 		const MAX_HEIGHT = 150;
		// 		let height = 0;
		// 		for (const marker of (markers as CommentMarker[])) {
		// 			const num_end_line = marker.range.text.match(/\n/g)?.length || 0;
		// 			const comment_length = marker.range.to - marker.range.from - 6 - num_end_line;
		// 			const num_lines = Math.max(1, Math.ceil(comment_length / char_line_length)) + num_end_line;
		// 			height += Math.min(MAX_HEIGHT, num_lines * line_pixel_height + PADDING + INNER_MARGIN + BORDER_SIZE) + MARGIN_BETWEEN;
		// 		}
		// 		height += WIGGLE_ROOM;
		// console.log(height);


		// Constructs element if gutter was initialised from empty
		if (this.i == gutter.elements.length) {
			// Create a new Gutter Element at position
			const newElt = new CommentGutterElement(view, height, above, markers, block);
			gutter.elements.push(newElt);

			gutter.dom.appendChild(newElt.dom);
		}

		// Update element (move up/down) if gutter already exists
		else {
			(gutter.elements as CommentGutterElement[])[this.i].update(view, height, above, markers, block);
		}

		this.previous_element_end = block_start + height;

		this.i++;
	}
}

class CommentSingleGutterView extends SingleGutterView {
	hide_on_empty: boolean = false;
	showing: boolean = true;

	constructor(public view: EditorView, public config: Required<GutterConfig>) {
		super(view, config);

		if (view.state.facet(commentGutterWidthState))
			this.dom.style.width = view.state.facet(commentGutterWidthState) + 'px';

		if (view.state.facet(hideEmptyCommentGutterState))
			this.hide_on_empty = true;
	}

	update(update: ViewUpdate) {
		const result = super.update(update);

		// Apply effect to the gutter
		for (const tr of update.transactions) {
			for (const eff of tr.effects) {
				if (eff.is(hideEmptyCommentGutterEffect)) {
					this.hide_on_empty = eff.value;
					break;
				} else if (eff.is(commentGutterWidthEffect)) {
					this.dom.style.width = eff.value + 'px';
					break;
				}
			}
		}

		if (this.showing && this.hide_on_empty && update.state.field(commentGutterMarkers).size === 0) {
			this.dom.parentElement!.classList.add('gutter-hidden');
			this.showing = false;
		} else if (!this.showing && (!this.hide_on_empty || update.state.field(commentGutterMarkers).size !== 0)) {
			this.dom.parentElement!.classList.remove('gutter-hidden');
			this.showing = true;
		}

		// Boolean returns true only if markers have changed within the viewport (so outside markers don't count)
		return result;
	}
}

class CommentGutterElement extends GutterElement {
	constructor(view: EditorView, height: number, above: number, markers: readonly GutterMarker[], public block: BlockInfo | null = null) {
		super(view, height, above, markers);
	}

	/**
	 * Comment update function that does not forcibly set the height of the gutter element
	 */
	update(view: EditorView, height: number, above: number, markers: readonly GutterMarker[], block: BlockInfo | null = null) {
		this.block = block;
		// if (this.height != height)
		// 	this.dom.style.height = (this.height = height) + 'px';
		if (this.above != above)
			this.dom.style.marginTop = (this.above = above) ? above + 'px' : '';
		if (!sameMarkers(this.markers, markers)) {
			this.setMarkers(view, markers);
		}
	}
}
