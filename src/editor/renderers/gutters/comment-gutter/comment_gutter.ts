/**
 * This gutter is a modified version of the one defined in @codemirror/view/gutter
 * The main changes are:
 *  1. Gutter is inserted next to the contentDOM (instead of before)
 *  2. Height of gutterElement is not specified
 *  3. GutterElement can be of arbitrary height
 *  4. Exposed method for moving the gutter up/down to align with the block it is attached to
 *  5. Gutter *can* be zero-width if there are no markers in the document
 */
import { type Extension, Facet } from "@codemirror/state";
import { BlockInfo, EditorView, GutterMarker, ViewUpdate } from "@codemirror/view";

import { setIcon } from "obsidian";
import {
	commentGutterFoldButtonState,
	commentGutterFolded,
	commentGutterFoldedState,
	commentGutterWidthState,
	hideEmptyCommentGutterState,
} from "../../../settings";
import {
	createGutter,
	createGutterViewPlugin,
	type GutterConfig,
	GutterElement,
	GutterView,
	sameMarkers,
	SingleGutterView,
	UpdateContext,
} from "../base";
import { commentGutterMarkers, CommentMarker } from "./marker";
import { commentGutterCompartment } from "./index";

const unfixGutters = Facet.define<boolean, boolean>({
	combine: values => values.some(x => x),
});

const activeGutters = Facet.define<Required<GutterConfig>>();

export class CommentGutterView extends GutterView {
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
						commentGutterCompartment.reconfigure([])
					]
				}));
			});
		}
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
		return (this.gutters as CommentSingleGutterView[]).map(gutter =>
			new CommentUpdateContext(gutter, this.view.viewport, -this.view.documentPadding.top)
		);
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
		const activeGutter = this.gutters[0];

		// Given the marker, fetch the gutterElement it belongs to
		const elementIdx = activeGutter.elements.findIndex(element => element.markers.includes(marker));
		if (elementIdx === -1) return;

		const gutterElement = activeGutter.elements[elementIdx] as CommentGutterElement;
		const widgetIndex = gutterElement.markers.indexOf(marker);

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
			element.dom.style.marginTop = parseInt(element.dom.style.marginTop || "0") + offset + "px";
		}
	}

	public foldGutter() {
		(this.gutters[0] as CommentSingleGutterView).foldGutter();
	}

	public focusCommentThread(position: number, index: number = -1) {
		// Find element with range in it
		const element = this.gutters[0].elements.find(
			element =>
				(element as CommentGutterElement).block!.from <= position &&
				position <= (element as CommentGutterElement).block!.to,
		);

		if (element) {
			const marker = element.markers.find(marker => {
				return position >= (marker as CommentMarker).comment_range.from &&
					position <= (marker as CommentMarker).comment_range.full_range_back;
			}) as CommentMarker | undefined;
			if (!marker) return;

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
	new_gutter_elements: CommentGutterElement[] = [];
	added_elements: CommentGutterElement[] = [];

	constructor(
		readonly gutter: CommentSingleGutterView,
		viewport: { from: number; to: number },
		public height: number,
	) {
		super(gutter, viewport, height);
		this.previous_element_end = height;
	}

	async addElement(view: EditorView, block: BlockInfo, markers: readonly GutterMarker[]) {
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
		// FIXME: Marker without comment_range issue
		// NOTE: This may be addresses used startSide bias in gutterMarker (warning: update concern)
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
		const height = this.gutter.elements[this.i]?.dom.clientHeight || UNKNOWN_HEIGHT;

		let element_idx = -1;
		for (let i = this.i; i < this.gutter.elements.length; i++) {
			if (sameMarkers(this.gutter.elements[i].markers, markers)) {
				element_idx = i;
				break;
			}
		}

		if (element_idx !== -1) {
			const element = this.gutter.elements[element_idx];
			for (let i = this.i; i < element_idx; i++) {
				this.gutter.dom.removeChild(this.gutter.elements[i].dom);
				this.gutter.elements[i].destroy();
			}
			for (const added_element of this.added_elements)
				this.gutter.dom.insertBefore(added_element.dom, element.dom);
			this.new_gutter_elements.push(...this.added_elements);
			this.added_elements = [];

			this.i = element_idx + 1;
			this.new_gutter_elements.push(element);
			element.update(view, height, above, markers, block);
		} else {
			this.added_elements.push(new CommentGutterElement(view, height, above, markers, block));
		}

		this.previous_element_end = block_start + height;
	}

	finish() {
		for (let i = this.i; i < this.gutter.elements.length; i++) {
			this.gutter.dom.removeChild(this.gutter.elements[i].dom);
			this.gutter.elements[i].destroy();
		}
		for (const added_element of this.added_elements)
			this.gutter.dom.appendChild(added_element.dom);
		this.gutter.elements = [...this.new_gutter_elements, ...this.added_elements];
		this.new_gutter_elements = [];
		this.added_elements = [];
	}
}

class CommentSingleGutterView extends SingleGutterView {
	fold_button: HTMLElement | undefined = undefined;
	declare elements: CommentGutterElement[];

	constructor(public view: EditorView, public config: Required<GutterConfig>) {
		super(view, config);

		const folded = view.state.facet(commentGutterFoldedState);
		if (
			(view.state.facet(hideEmptyCommentGutterState) && view.state.field(commentGutterMarkers).size === 0) ||
			folded
		) {
			this.dom.style.width = "0";
		} else {
			this.dom.style.width = view.state.facet(commentGutterWidthState) + "px";
		}

		if (view.state.facet(commentGutterFoldButtonState))
			this.createFoldButton(folded);
	}

	createFoldButton(folded: boolean) {
		if (this.view.dom.children[0].classList.contains("criticmarkup-gutter-button"))
			this.fold_button = this.view.dom.children[0] as HTMLElement;
		else {
			this.fold_button = createEl("a", { cls: ["criticmarkup-gutter-button", "view-action"] });
			this.view.dom.prepend(this.fold_button);
			setIcon(this.fold_button, "arrow-right-from-line");
			this.fold_button.setAttribute("data-tooltip-position", "left");
		}

		this.setFoldButtonState(folded);
		this.fold_button.onclick = this.foldGutter.bind(this);
		this.fold_button!.style.display = this.view.state.field(commentGutterMarkers).size ? "" : "none";
	}

	setFoldButtonState(folded: boolean) {
		if (folded) {
			this.fold_button!.style.right = "20px";
			this.fold_button!.style.rotate = "-180deg";
			this.fold_button!.ariaLabel = "Unfold gutter";
		} else {
			this.fold_button!.style.right = this.view.state.facet(commentGutterWidthState) + 60 + "px";
			this.fold_button!.style.rotate = "0deg";
			this.fold_button!.ariaLabel = "Fold gutter";
		}
	}

	foldGutter() {
		const folded = !this.view.state.facet(commentGutterFoldedState);
		const gutterStart = this.view.state.facet(commentGutterWidthState);
		if (this.fold_button)
			this.setFoldButtonState(folded);

		// Set the gutter height for every element to fixed such that the element doesn't break the layout
		if (folded) {
			this.elements.forEach(element => {
				Array.from(element.dom.getElementsByClassName("criticmarkup-gutter-comment")).forEach(comment => {
					comment.setAttribute("style", `max-height: ${comment.clientHeight}px; overflow: hidden;`);
				});
			});
		} else {
			this.dom.addEventListener("transitionend", () => {
				this.elements.forEach(element => {
					Array.from(element.dom.getElementsByClassName("criticmarkup-gutter-comment")).forEach(comment => {
						comment.setAttribute("style", ``);
					});
				});
			}, { once: true });
		}
		this.dom.style.width = folded ? "0" : gutterStart + "px";

		this.view.dispatch({
			effects: commentGutterFolded.reconfigure(commentGutterFoldedState.of(folded)),
		});
	}

	update(update: ViewUpdate) {
		const result = super.update(update);

		const hideEmpty = update.state.facet(hideEmptyCommentGutterState);
		const width = update.state.facet(commentGutterWidthState);
		const foldButton = update.state.facet(commentGutterFoldButtonState);
		const folded = update.state.facet(commentGutterFoldedState);
		const widgets = update.state.field(commentGutterMarkers);

		if (hideEmpty !== update.startState.facet(hideEmptyCommentGutterState)) {
			if (hideEmpty && update.state.field(commentGutterMarkers).size === 0)
				this.dom.style.width = "0";
			else
				this.dom.style.width = update.state.facet(commentGutterWidthState) + "px";
		} else if (width !== update.startState.facet(commentGutterWidthState)) {
			if (!hideEmpty && !folded)
				this.dom.style.width = width + "px";
		} else if (foldButton !== update.startState.facet(commentGutterFoldButtonState)) {
			if (foldButton && !this.fold_button)
				this.createFoldButton(folded);
			else if (!foldButton && this.fold_button) {
				this.fold_button.remove();
				this.fold_button = undefined;
			}
		}

		if (widgets.size !== update.startState.field(commentGutterMarkers).size) {
			if (widgets.size === 0) {
				if (this.fold_button)
					this.fold_button.style.display = "none";
				if (hideEmpty)
					this.dom.style.width = "0";
			} else {
				if (this.fold_button)
					this.fold_button.style.display = "";
				if (!folded)
					this.dom.style.width = width + "px";
			}
		}

		// Boolean returns true only if markers have changed within the viewport (so outside markers don't count)
		return result;
	}
}

class CommentGutterElement extends GutterElement {
	constructor(
		view: EditorView,
		height: number,
		above: number,
		markers: readonly GutterMarker[],
		public block: BlockInfo | null = null,
	) {
		super(view, height, above, markers);
	}

	/**
	 * Comment update function that does not forcibly set the height of the gutter element
	 */
	update(
		view: EditorView,
		height: number,
		above: number,
		markers: readonly GutterMarker[],
		block: BlockInfo | null = null,
	) {
		this.block = block;
		if (this.above != above)
			this.dom.style.marginTop = (this.above = above) ? above + "px" : "";
		if (!sameMarkers(this.markers, markers))
			this.setMarkers(view, markers);
	}
}
