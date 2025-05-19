/**
 * This gutter is a modified version of the one defined in @codemirror/view/gutter
 * The main changes are:
 *  1. Gutter is inserted next to the contentDOM (instead of before)
 *  2. Height of gutterElement is not specified
 *  3. GutterElement can be of arbitrary height
 *  4. Added annotation listeners for focusing GutterMarkers
 *  5. Gutter *can* be zero-width if there are no markers in the document
 */
import {Annotation, type Extension, Facet} from "@codemirror/state";
import { BlockInfo, EditorView, GutterMarker, ViewUpdate } from "@codemirror/view";

import { debounce, setIcon } from "obsidian";
import {
	annotationGutterFoldButtonState,
	annotationGutterFolded,
	annotationGutterFoldedState,
	annotationGutterResizeHandleState,
	annotationGutterWidth,
	annotationGutterWidthState,
	hideEmptyAnnotationGutterState,
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
import { annotationGutterMarkers, AnnotationMarker } from "./marker";
import { annotationGutterCompartment } from "./index";
import { markupFocusEffect } from "../../live-preview";

const FOLD_BUTTON_OFFSET = 60;

const unfixGutters = Facet.define<boolean, boolean>({
	combine: values => values.some(x => x),
});

const activeGutters = Facet.define<Required<GutterConfig>>();

export const annotationGutterFocusAnnotation = Annotation.define<{ from: number, to: number, index?: number, scroll?: boolean }>();
// export const annotationGutterSyncGutter = Annotation.define<boolean>;

export class AnnotationGutterView extends GutterView {
	previously_focused: AnnotationMarker | undefined = undefined;

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
						annotationGutterCompartment.reconfigure([])
					]
				}));
			});
		}
	}

	// EXPL: When moving a selection inside the editor, multiple moveGutter calls are triggered,
	//       causing wonkyness and ever greater up/downwards movement
	debouncedMoveGutter = debounce(this.moveGutter.bind(this), 200);

	createGutters(view: EditorView) {
		return view.state.facet(activeGutters).map(conf => new AnnotationSingleGutterView(view, conf, this.dom));
	}

	insertGutters(view: EditorView) {
		view.contentDOM.parentNode!.insertBefore(this.dom, view.contentDOM.nextSibling);
	}

	insertDetachedGutters(after: HTMLElement) {
		this.view.contentDOM.parentNode!.insertBefore(this.dom, this.view.contentDOM.nextSibling);
	}

	getUpdateContexts(): UpdateContext[] {
		return (this.gutters as AnnotationSingleGutterView[]).map(gutter =>
			new AnnotationUpdateContext(gutter, this.view.viewport, -this.view.documentPadding.top)
		);
	}

	unfocusAnnotation() {
		this.previously_focused?.unfocus_annotation();
		this.previously_focused = undefined;
	}

	focusAnnotation(marker: AnnotationMarker, index: number, scroll: boolean = false, focus_markup = false) {
		this.previously_focused = marker;
		this.debouncedMoveGutter(marker);
		marker.focus_annotation(index, scroll);

		if (focus_markup) {
			setTimeout(() => {
				this.view.dispatch(
					this.view.state.update({
						effects: [
							markupFocusEffect.of({
								from: marker.annotation.from,
								to: marker.annotation.full_range_back
							})
						]
					})
				);
			});
		}
	}

	updateGutters(update: ViewUpdate): boolean {
		// EXPL: Check all transactions, figure out if they have been annotated with a focus shift annotation
		// TODO: Is there a better way to check the annotations of a ViewUpdate?
		const annotation = update.transactions.flatMap(tr => tr.annotation(annotationGutterFocusAnnotation)).find(e => e);
		if (annotation || update.startState.selection !== update.state.selection) {
			this.unfocusAnnotation();
		}

		if (annotation) {
			const { from, to, index = -1, scroll = false } = annotation;

			// EXPL: Find a GutterElement and then GutterMarker that contains the cursor
			// NOTE: In a previous version of this code, AnnotationGutterElement's `block.to` was used
			//       in order to find the GutterMarker that contains the cursor, however,
			//       the block only represents the starting line of the GutterElement, and does not work
			//       for markers that span multiple lines
			// TODO: Improve the performance of this code, I am not a big fan of linearly searching like this
			// NOTE: Did you know you can label loops? I didn't. Neat huh?
			outer_loop:
			for (const element of this.gutters[0].elements as AnnotationGutterElement[]) {
				if (from >= element.block!.from) {
					for (const marker of element.markers as AnnotationMarker[]) {
						if (from >= marker.annotation.from && to <= marker.annotation.full_range_back) {
							this.focusAnnotation(marker, index, scroll);
							break outer_loop;
						}
					}
				} else if (from < element.block!.from) {
					break;
				}
			}
		}

		return super.updateGutters(update);
	}

	/**
	 * Moves the initial GutterElement of the gutter up or down to align provided marker with its block
	 * @param marker - Marker to align the gutter by
	 */
	public moveGutter(marker: GutterMarker) {
		// We only need to consider one gutter for the annotations gutter
		const activeGutter = this.gutters[0];

		// Given the marker, fetch the gutterElement it belongs to
		const element = activeGutter.elements.find(element => element.markers.includes(marker)) as AnnotationGutterElement | undefined;
		if (!element) return;

		const markerIndex = element.markers.indexOf(marker);

		 // Where the gutter element should be located (i.e. flush with the top of the block)
		const desiredLocation = element.block!.top;
		 // Where the gutter element is currently located (possibly pushed down by other gutter elements)
		const currentLocation = (element.dom.children[markerIndex] as HTMLElement).offsetTop;

		// Determine the offset between the current location and the desired location
		let offset = desiredLocation - currentLocation;

		// EXPL: It is preferred not to make micro-adjustments
		if (Math.abs(offset) >= 10 && offset) {
			const element = activeGutter.elements[0];
			element.dom.style.marginTop = parseInt(element.dom.style.marginTop || "0") + offset + "px";
		}
	}

	public foldGutter() {
		(this.gutters[0] as AnnotationSingleGutterView).foldGutter();
	}
}

const annotationGutterView = createGutterViewPlugin(AnnotationGutterView);

export function annotation_gutter(config: GutterConfig): Extension {
	return createGutter(annotationGutterView, config, activeGutters, unfixGutters);
}

class AnnotationUpdateContext extends UpdateContext {
	/**
	 * Describes the y-position of the bottom of the previous gutter element
	 */
	previous_element_end: number = 0;
	new_gutter_elements: AnnotationGutterElement[] = [];
	added_elements: AnnotationGutterElement[] = [];

	constructor(
		readonly gutter: AnnotationSingleGutterView,
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
		(markers as unknown as AnnotationMarker[]).sort((a, b) => a.annotation.from - b.annotation.from);

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
			this.added_elements.push(new AnnotationGutterElement(view, height, above, markers, block));
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

class AnnotationSingleGutterView extends SingleGutterView {
	fold_button: HTMLElement | undefined = undefined;
	resize_handle: HTMLElement | undefined = undefined;
	declare elements: AnnotationGutterElement[];

	constructor(public view: EditorView, public config: Required<GutterConfig>, private gutterDom: HTMLElement) {
		super(view, config);

		const folded = view.state.facet(annotationGutterFoldedState);
		if (
			(view.state.facet(hideEmptyAnnotationGutterState) && view.state.field(annotationGutterMarkers).size === 0) ||
			folded
		) {
			this.dom.style.width = "0";
		} else {
			this.dom.style.width = view.state.facet(annotationGutterWidthState) + "px";
		}

		if (view.state.facet(annotationGutterFoldButtonState))
			this.createFoldButton(folded);

		if (view.state.facet(annotationGutterResizeHandleState)) {
			this.createResizeHandle();
		}
	}

	createFoldButton(folded: boolean) {
		if (this.view.dom.children[0].classList.contains("cmtr-anno-gutter-button"))
			this.fold_button = this.view.dom.children[0] as HTMLElement;
		else {
			this.fold_button = createEl("a", { cls: ["cmtr-anno-gutter-button", "view-action"] });
			this.view.dom.prepend(this.fold_button);
			setIcon(this.fold_button, "arrow-right-from-line");
			this.fold_button.setAttribute("data-tooltip-position", "left");
		}

		this.setFoldButtonState(folded);
		this.fold_button.onclick = this.foldGutter.bind(this);
		this.fold_button!.style.display = this.view.state.field(annotationGutterMarkers).size ? "" : "none";
	}

	createResizeHandle() {
		if (this.gutterDom.children[0]?.classList.contains("cmtr-anno-gutter-resize-handle")) {
			this.resize_handle = this.gutterDom.children[0] as HTMLElement;
		} else {
			this.resize_handle = createEl("hr", { cls: ["cmtr-anno-gutter-resize-handle"] });
			this.gutterDom.appendChild(this.resize_handle);

			this.resize_handle.addEventListener("mousedown", (e) => {
				let initialPosition = e.clientX;

				// NOTE: Prevent excessive state updates and DOM redraws
				const setWidth = debounce((width: number) => {
					this.dom.style.width = width + "px";
					this.view.dispatch({
						effects: annotationGutterWidth.reconfigure(annotationGutterWidthState.of(width)),
					});
					if (this.fold_button) {
						this.fold_button.style.right = width + FOLD_BUTTON_OFFSET + "px";
					}
				}, 25);

				this.resize_handle!.classList.toggle("cmtr-anno-gutter-resize-handle-hover", true);
				this.fold_button?.classList.toggle("cmtr-anno-gutter-moving", true);
				this.gutterDom.classList.toggle("cmtr-anno-gutter-moving", true);

				let currentWidth = parseInt(this.dom.style.width.slice(0, -2));
				const onMouseMove = (evt: MouseEvent) => {
					const deltaX = evt.clientX - initialPosition;
					initialPosition = evt.clientX
					currentWidth -= deltaX;
					setWidth(currentWidth);

					return true;
				}

				const onMouseStop = () => {
					document.removeEventListener("mousemove", onMouseMove);
					document.removeEventListener("mouseup", onMouseStop);
					this.resize_handle!.classList.toggle("cmtr-anno-gutter-resize-handle-hover", false);
					this.fold_button?.classList.toggle("cmtr-anno-gutter-moving", false);
					this.gutterDom.classList.toggle("cmtr-anno-gutter-moving", false);
				}

				document.addEventListener("mousemove", onMouseMove);
				document.addEventListener("mouseup", onMouseStop);

				return true;
			});
		}
		this.resize_handle!.style.display = (this.view.state.field(annotationGutterMarkers).size && !this.view.state.facet(annotationGutterFoldedState)) ? "" : "none";
	}

	setFoldButtonState(folded: boolean, width?: number) {
		if (folded) {
			this.fold_button!.style.right = "20px";
			this.fold_button!.style.rotate = "-180deg";
			this.fold_button!.ariaLabel = "Unfold gutter";
			if (this.resize_handle) {
				this.resize_handle.style.display = 'none';
			}
		} else {
			this.fold_button!.style.right = (width ?? this.view.state.facet(annotationGutterWidthState)) + FOLD_BUTTON_OFFSET + "px";
			this.fold_button!.style.rotate = "0deg";
			this.fold_button!.ariaLabel = "Fold gutter";
			if (this.resize_handle) {
				this.resize_handle.style.display = '';
			}
		}
	}

	foldGutter() {
		const folded = !this.view.state.facet(annotationGutterFoldedState);
		const gutterWidth = this.view.state.facet(annotationGutterWidthState);
		if (this.fold_button) {
			this.setFoldButtonState(folded, gutterWidth);
		}

		// Set the gutter height for every element to fixed such that the element doesn't break the layout
		if (folded) {
			this.elements.forEach(element => {
				Array.from(element.dom.getElementsByClassName("cmtr-anno-gutter-annotation")).forEach(comment => {
					comment.setAttribute("style", `max-height: ${comment.clientHeight}px; overflow: hidden;`);
				});
			});
		} else {
			this.dom.addEventListener("transitionend", () => {
				this.elements.forEach(element => {
					Array.from(element.dom.getElementsByClassName("cmtr-anno-gutter-annotation")).forEach(comment => {
						comment.setAttribute("style", ``);
					});
				});
			}, { once: true });
		}
		this.dom.style.width = folded ? "0" : gutterWidth + "px";

		this.view.dispatch({
			effects: annotationGutterFolded.reconfigure(annotationGutterFoldedState.of(folded)),
		});
	}

	update(update: ViewUpdate) {
		const result = super.update(update);

		const hideEmpty = update.state.facet(hideEmptyAnnotationGutterState);
		const width = update.state.facet(annotationGutterWidthState);
		const foldButton = update.state.facet(annotationGutterFoldButtonState);
		const resizeHandle = update.state.facet(annotationGutterResizeHandleState);
		const folded = update.state.facet(annotationGutterFoldedState);
		const widgets = update.state.field(annotationGutterMarkers);

		if (hideEmpty !== update.startState.facet(hideEmptyAnnotationGutterState)) {
			if (hideEmpty && update.state.field(annotationGutterMarkers).size === 0)
				this.dom.style.width = "0";
			else
				this.dom.style.width = update.state.facet(annotationGutterWidthState) + "px";
		} else if (width !== update.startState.facet(annotationGutterWidthState)) {
			if (!hideEmpty && !folded)
				this.dom.style.width = width + "px";
		} else if (foldButton !== update.startState.facet(annotationGutterFoldButtonState)) {
			if (foldButton && !this.fold_button)
				this.createFoldButton(folded);
			else if (!foldButton && this.fold_button) {
				this.fold_button.remove();
				this.fold_button = undefined;
			}
		} else if (resizeHandle !== update.startState.facet(annotationGutterResizeHandleState)) {
			if (resizeHandle && !this.resize_handle)
				this.createResizeHandle();
			else if (!resizeHandle && this.resize_handle) {
				this.resize_handle.remove();
				this.resize_handle = undefined;
			}
		}

		if (widgets.size !== update.startState.field(annotationGutterMarkers).size) {
			if (widgets.size === 0) {
				if (this.fold_button)
					this.fold_button.style.display = "none";
				if (this.resize_handle)
					this.resize_handle.style.display = "none";
				if (hideEmpty)
					this.dom.style.width = "0";
			} else {
				if (this.fold_button)
					this.fold_button.style.display = "";
				if (this.resize_handle)
					this.resize_handle.style.display = "";
				if (!folded)
					this.dom.style.width = width + "px";
			}
		}

		// Boolean returns true only if markers have changed within the viewport (so outside markers don't count)
		return result;
	}
}

class AnnotationGutterElement extends GutterElement {
	constructor(
		view: EditorView,
		height: number,
		above: number,
		markers: readonly GutterMarker[],
		// IMPORTANT: The `block` variable represents the _starting_ line this GutterElement may belong to
		//		the annotations _may_ cover multiple lines, but the block will ONLY account for the first line
		//		In practice, this means that block.to IS NOT the end of the marker
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
