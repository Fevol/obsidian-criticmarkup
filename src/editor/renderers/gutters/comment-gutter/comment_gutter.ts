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


const MARGIN_BETWEEN = 5;

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
		view.scrollDOM.insertBefore(this.dom, view.contentDOM.nextSibling);
	}

	insertDetachedGutters(after: HTMLElement) {
		super.insertDetachedGutters(after);
	}

	getUpdateContexts(): UpdateContext[] {
		return (this.gutters as CommentSingleGutterView[]).map(gutter => new CommentUpdateContext(gutter, this.view.viewport, -this.view.documentPadding.top));
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

		const gutterElement = activeGutter.elements[elementIdx];
		const widgetIndex  = gutterElement.markers.indexOf(marker);

		const MARGIN_TOP = 50

		// @ts-ignore (marker is a CommentMarker that contains a reference to the lines the node is attached to)
		// For some reason I am not privy to, the gutterElement occasionally does not contain a reference to the block it is attached to
		//  so we manually find the block it is supposed to be attached to
		const block = this.view.viewportLineBlocks.find(line => marker.node.from >= line.from);

		// @ts-ignore (offsetTop is in the element)
		// Grab the offsetTop of the widget within the gutterElement, and its offset from to top of the element (and leave some margin at top)
		// This offset calculation results in the widget becoming 'flush' with the block it is attached to
		let offset = gutterElement.dom.children[widgetIndex].offsetTop - (gutterElement.block ? gutterElement.block.top : block?.top ?? gutterElement.dom.clientTop) - MARGIN_TOP;
		if (Math.abs(offset) < 10) offset = 0;
		if (offset) {
			const element = activeGutter.elements[0];
			element.dom.style.marginTop = parseInt(element.dom.style.marginTop || '0') - offset + 'px';
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
		// ORIGINAL
		// const above = block.top < this.previous_element_end ? this.previous_element_end : block.top - this.previous_element_end;
		// const above = block.top - this.previous_element_end;

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
		(markers as CommentMarker[]).sort((a, b) => a.node.from - b.node.from);

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
		 * @warning This is THE only part of the algorithm that needs an implementation, I dub it the '... height problem',
		 * 	   please - and I mean this with all sincerity in the world - please let me know if you are able to come up with a more elegant solution
		 * @fixme Blocks with many overlapping elements can cause comments to become desynced from the text (automatically resyncs once new viewport is rendered)
		 */
		const height2 = gutter.elements[this.i] ? gutter.elements[this.i].dom.clientHeight : 0;


		// FIXME: This is very dependant on... well, everything, but at least it kind of works
		// TODO: Find a more robust manner to determine the height of the block
		const char_line_length = 42;
		const line_pixel_height = 18;
		const PADDING = 16;
		const INNER_MARGIN = 6;
		const WIGGLE_ROOM = 0;
		const BORDER_SIZE = 4;
		const MAX_HEIGHT = 150;
		let height = 0;
		for (const marker of (markers as CommentMarker[])) {
			const num_end_line = marker.node.text.match(/\n/g)?.length || 0;
			const comment_length = marker.node.to - marker.node.from - 6 - num_end_line;
			const num_lines = Math.max(1, Math.ceil(comment_length / char_line_length)) + num_end_line;
			height += Math.min(MAX_HEIGHT, num_lines * line_pixel_height + PADDING + INNER_MARGIN + BORDER_SIZE) + MARGIN_BETWEEN;
		}
		height += WIGGLE_ROOM;
		// console.log(height, height2, gutter.elements[this.i], block_start, above);


		const sel_height = height2 || height;


		// Constructs element if gutter was initialised from empty
		if (this.i == gutter.elements.length) {
			// Create a new Gutter Element at position
			const newElt = new CommentGutterElement(view, sel_height, above, markers);
			gutter.elements.push(newElt);

			gutter.dom.appendChild(newElt.dom);
		}

		// Update element (move up/down) if gutter already exists
		else {
			gutter.elements[this.i].update(view, sel_height, above, markers);
		}

		this.previous_element_end = block_start + sel_height;

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
	/**
	 * Comment update function that does not forcibly set the height of the gutter element
	 */
	update(view: EditorView, height: number, above: number, markers: readonly GutterMarker[]) {
		// if (this.height != height)
		// 	this.dom.style.height = (this.height = height) + 'px';
		if (this.above != above)
			this.dom.style.marginTop = (this.above = above) ? above + 'px' : '';
		if (!sameMarkers(this.markers, markers)) {
			this.setMarkers(view, markers);
		}
	}
}
