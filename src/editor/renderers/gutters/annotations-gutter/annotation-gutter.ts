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

import { debounce, editorInfoField, setIcon } from "obsidian";
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

// EXPL: Margin between the gutter and the content
const ANNOTATION_GUTTER_MARGIN = 24;

const unfixGutters = Facet.define<boolean, boolean>({
	combine: values => values.some(x => x),
});

const activeGutters = Facet.define<Required<AnnotationGutterConfig>>();

export const annotationGutterFocusAnnotation = Annotation.define<{ from: number, to: number, index?: number, scroll?: boolean }>();
export const annotationGutterFoldAnnotation = Annotation.define<boolean | null>();
export const annotationGutterFocusThreadAnnotation = Annotation.define<{ marker: AnnotationMarker, index: number, scroll?: boolean, focus_markup?: boolean }>();
export const annotationGutterWidthAnnotation = Annotation.define<number>();
export const annotationGutterHideEmptyAnnotation = Annotation.define<boolean>();
export const annotationGutterFoldButtonAnnotation = Annotation.define<boolean>();
export const annotationGutterResizeHandleAnnotation = Annotation.define<boolean>();

export class AnnotationGutterView extends GutterView {
	declare gutters: AnnotationSingleGutterView[];

	previously_focused: AnnotationMarker | undefined = undefined;

	constructor(view: EditorView) {
		super(view, unfixGutters, activeGutters);
		// FIXME: this still causes a layout shift
		// EXPL: If the gutter is not inside a Markdown View, hide it and remove it from the gutter extension from the view
		if (!view.dom.parentElement!.classList.contains("markdown-source-view")) {
			// NOTE: Prevents gutter from appearing for a brief second (until setImmediate kicks in)
			this.dom.style.display = 'none';
			// NOTE: Codemirror doesn't allow state changes during updates, so reconfiguration needs to be delayed
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

	update(update: ViewUpdate) {
		for (const transaction of update.transactions) {
			const thread_focus = transaction.annotation(annotationGutterFocusThreadAnnotation);
			if (thread_focus) {
				const { marker, index, scroll = false, focus_markup = false } = thread_focus;
				this.unfocusAnnotation();
				this.focusAnnotation(marker, index, scroll, focus_markup);
			}
		}
		super.update(update);
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
			window.setTimeout(() => {
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
		// NOTE: We can assume that only one gutter exists
		const activeGutter = this.gutters[0];

		// EXPL: Given the 'highlighted' marker, fetch the gutterElement it belongs to
		const element = activeGutter.elements.find(element => element.markers.includes(marker)) as AnnotationGutterElement | undefined;
		if (!element) {
			return;
		}
		const markerIndex = element.markers.indexOf(marker);

		// EXPL: Where the gutter element should be located (i.e. flush with the top of the block)
		const desiredLocation = element.block!.top;
		// EXPL: Where the gutter element is currently located (possibly pushed down by other gutter elements)
		// FIXME: offsetTop not defined error (repr: when interacting in phantom comment note)
		const currentLocation = (element.dom.children[markerIndex] as HTMLElement).offsetTop;

		// EXPL: Determine the offset between the current location and the desired location
		let offset = desiredLocation - currentLocation;

		// EXPL: It is preferred not to make micro-adjustments on the gutter, so a small offset is ignored
		if (Math.abs(offset) >= 10 && offset) {
			const element = activeGutter.elements[0];
			element.dom.style.marginTop = parseInt(element.dom.style.marginTop || "0") + offset + "px";
		}
	}

	public foldGutter() {
		(this.gutters[0] as AnnotationSingleGutterView).foldGutter();
	}
}

export const annotationGutterView = createGutterViewPlugin(AnnotationGutterView);

export interface AnnotationGutterConfig extends GutterConfig {
	/**
	 * Whether the gutter should be folded by default
	 */
	foldState: boolean;

	/**
	 * The width of the gutter in pixels
	 */
	width: number;

	/**
	 * Whether the gutter should be hidden when empty
	 */
	hideOnEmpty: boolean;

	/**
	 * Whether the gutter should include a fold button
	 */
	includeFoldButton: boolean;

	/**
	 * Whether the gutter should include a resize handle
	 */
	includeResizeHandle: boolean;
}


export function annotation_gutter(config: AnnotationGutterConfig): Extension {
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
		// NOTE: This may be addresses by using the startSide bias in gutterMarker (warning: update concern)
		(markers as unknown as AnnotationMarker[])
			.sort((a, b) => a.annotation.from - b.annotation.from);

		const UNKNOWN_HEIGHT = 36;

		/**
		 * Complete height of the GutterElement, including BOTTOM margin (i.e. spacing between gutter elements)
		 * @remark The reason *why* this is an absolutely essential value, is that it ensures that no elements can overlap,
		 *     if estimated height is lower than actual height, then GutterElements of two blocks risk overlapping
		 *     if estimated height is higher than actual height, then GutterElements will have an unnecessarily large gap between them
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


		// EXPL: Search for an existing GutterElement with the same markers
		const element_idx = this.gutter.elements
			.findIndex(e => sameMarkers(e.markers, markers));

		// EXPL: If a GutterElement already exists, and it has the exact same markers,
		//      remove all the GutterElements before this element
		//    	and re-insert all the newly added elements before this element
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
		}

		// EXPL: Otherwise, if the GutterElement does not exist, create a new one and it to the gutter later
		else {
			this.added_elements.push(new AnnotationGutterElement(view, height, above, markers, block));
		}

		this.previous_element_end = block_start + height;
	}

	finish() {
		// EXPL: Finally, at the end of the update, remove all remaining GutterElements
		for (let i = this.i; i < this.gutter.elements.length; i++) {
			this.gutter.dom.removeChild(this.gutter.elements[i].dom);
			this.gutter.elements[i].destroy();
		}

		// EXPL: Add all the remaining added GutterElements to the gutter
		for (const added_element of this.added_elements) {
			this.gutter.dom.appendChild(added_element.dom);
		}
		this.gutter.elements = [...this.new_gutter_elements, ...this.added_elements];
		this.new_gutter_elements = [];
		this.added_elements = [];
	}
}

class AnnotationSingleGutterView extends SingleGutterView {
	folded: boolean = false;
	hide_on_empty: boolean = false;
	width: number = 0;
	add_fold_button: boolean = false;
	add_resize_handle: boolean = false;

	gutter_position: number = 0;

	fold_button_el: HTMLElement | undefined = undefined;
	resize_handle_el: HTMLElement | undefined = undefined;
	declare elements: AnnotationGutterElement[];

	constructor(public view: EditorView, public config: Required<AnnotationGutterConfig>, private gutterDom: HTMLElement) {
		super(view, config);

		this.folded = config.foldState;
		this.width = config.width;
		this.hide_on_empty = config.hideOnEmpty;
		this.add_fold_button = config.includeFoldButton;
		this.add_resize_handle = config.includeResizeHandle;

		if ((this.hide_on_empty && view.state.field(annotationGutterMarkers).size === 0) || this.folded) {
			this.dom.style.width = "0";
		} else {
			this.dom.style.width = this.width + "px";
		}
		this.view.dom.style.setProperty("--cmtr-anno-gutter-width", this.folded ? "0px" : this.width + "px");
		this.gutterDom.style.marginInlineStart = this.folded ? "0" : ANNOTATION_GUTTER_MARGIN + "px";
		this.gutter_position = this.view.scrollDOM.getBoundingClientRect().right - this.view.contentDOM.getBoundingClientRect().right + ANNOTATION_GUTTER_MARGIN;

		if (this.add_fold_button) {
			this.createFoldButton();
		}

		if (this.add_resize_handle) {
			this.createResizeHandle();
		}
	}

	createFoldButton() {
		const foldButtonElement = createEl("a", { cls: ["view-action"] });
		setIcon(foldButtonElement, "arrow-right-from-line");
		foldButtonElement.setAttribute("data-tooltip-position", "left");
		foldButtonElement.style.display = this.view.state.field(annotationGutterMarkers).size ? "" : "none";
		foldButtonElement.onclick = () => {
			this.folded = !this.folded;
			this.view.state.field(editorInfoField).app.workspace.requestSaveLayout();
			this.foldGutter();
		}

		this.setFoldButtonState();
		this.fold_button_el = createDiv({ cls: ["cmtr-anno-gutter-button"] });
		this.fold_button_el.appendChild(foldButtonElement);
		this.gutterDom.appendChild(this.fold_button_el);
	}

	createResizeHandle() {
		this.resize_handle_el = createEl("hr", { cls: ["cmtr-anno-gutter-resize-handle"] });
		this.resize_handle_el.style.display = (this.view.state.field(annotationGutterMarkers).size && !this.folded) ? "" : "none";
		this.resize_handle_el.addEventListener("mousedown", (e) => {
			let initialPosition = e.clientX;
			let isReadableLineWidth = this.view.state.field(editorInfoField).app.vault.getConfig("readableLineLength");
			const temporarySheet = document.styleSheets[0];

			// EXPL: Debounce to prevent excessive state updates and DOM redraws while dragging the handle
			const setWidth = debounce((width: number) => {
				this.width = Math.round(Math.max(0, width));
				this.view.state.field(editorInfoField).app.workspace.requestSaveLayout();
				this.dom.style.width = this.width + "px";
				this.view.dom.style.setProperty("--cmtr-anno-gutter-width", this.width + "px");

				// TODO: Improve resizing logic when user has readable line length enabled
				//       When resizing, .cm-line's width adjust even when not necessary, causing jarring content shifts
				// EXPL: Freezes the width of .cm-line to prevent content shifting, reduces the amount of shifts a lot
				//		 (Trust me, it is _much_ worse without this bodge)
				if (isReadableLineWidth) {
					temporarySheet.deleteRule(temporarySheet.cssRules.length - 1);
					temporarySheet.insertRule(`.cmtr-anno-gutter-resizing .cm-line { width: ${this.view.contentDOM.clientWidth}px !important; }`, temporarySheet.cssRules.length);
					this.gutter_position = this.view.scrollDOM.getBoundingClientRect().right - this.view.contentDOM.getBoundingClientRect().right + ANNOTATION_GUTTER_MARGIN;
				}
			}, 25);

			this.resize_handle_el!.classList.toggle("cmtr-anno-gutter-resize-handle-hover", true);
			this.view.scrollDOM.classList.toggle("cmtr-anno-gutter-resizing", true);

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
				this.resize_handle_el!.classList.toggle("cmtr-anno-gutter-resize-handle-hover", false);
				this.view.scrollDOM.classList.toggle("cmtr-anno-gutter-resizing", false);

				if (isReadableLineWidth) {
					temporarySheet.deleteRule(temporarySheet.cssRules.length - 1);
				}
			}

			document.addEventListener("mousemove", onMouseMove);
			document.addEventListener("mouseup", onMouseStop);

			return true;
		});

		this.gutterDom.appendChild(this.resize_handle_el);
	}

	setFoldButtonState() {
		if (this.fold_button_el) {
			if (this.folded) {
				this.fold_button_el.children[0].setAttribute("style", "rotate: -180deg;");
				this.fold_button_el.children[0].ariaLabel = "Unfold gutter";
				if (this.resize_handle_el) {
					this.resize_handle_el.style.display = 'none';
				}
			} else {
				this.fold_button_el.children[0].setAttribute("style", "rotate: 0deg;");
				this.fold_button_el.children[0].ariaLabel = "Fold gutter";
				if (this.resize_handle_el) {
					this.resize_handle_el.style.display = '';
				}
			}
		}
	}

	foldGutter() {
		this.setFoldButtonState();

		// EXPL: Set the height for every marker to fixed so that they won't resize while the gutter is changing width
		if (this.folded) {
			this.elements.forEach(element => {
				Array.from(element.dom.getElementsByClassName("cmtr-anno-gutter-annotation")).forEach(comment => {
					comment.setAttribute("style", `max-height: ${comment.clientHeight}px; overflow: hidden;`);
				});
			});
		} else {
			this.dom.addEventListener("transitionend", () => {
				this.elements.forEach(element => {
					Array.from(element.dom.getElementsByClassName("cmtr-anno-gutter-annotation")).forEach(comment => {
						comment.removeAttribute("style");
					});
				});
			}, { once: true });
		}
		this.dom.style.width = this.folded ? "0" : this.width + "px";
		this.gutterDom.style.marginInlineStart = this.folded ? "0" : ANNOTATION_GUTTER_MARGIN + "px";

		if (this.view.state.field(editorInfoField).app.vault.getConfig("readableLineLength")) {
			// EXPL: Computes the margin before and after the gutter has been folded
			const readableLineWidth = parseInt(getComputedStyle(this.view.scrollDOM).getPropertyValue("--file-line-width").trim());
			const marginWithoutGutter = Math.max(0, this.view.scrollDOM.innerWidth - readableLineWidth);
			const marginWithGutter = Math.max(0, marginWithoutGutter - this.width);
			const newMargin = (this.folded ? marginWithoutGutter : marginWithGutter) / 2;
			const oldMargin = (this.folded ? marginWithGutter : marginWithoutGutter) / 2;

			// EXPL: Freeze the contentDOM to prevent content shifting while the gutter is being folded
			this.view.contentDOM.style.width = this.view.contentDOM.clientWidth + (this.folded ? ANNOTATION_GUTTER_MARGIN : 0) + "px !important";
			// EXPL: Set the old margin to transition from
			this.view.scrollDOM.children[0].setAttribute("style", `margin: 0 ${oldMargin}px; transition: margin 0.4s ease-in-out, max-width 0.4s ease-in-out;`);
			if (!this.folded) {
				this.view.dom.style.setProperty("--cmtr-anno-gutter-width", this.width + "px");
			}

			setTimeout(() => {
				// EXPL: Transition to the new margin
				this.view.scrollDOM.children[0].setAttribute("style", `margin: 0 ${newMargin}px; transition: margin 0.4s ease-in-out, max-width 0.4s ease-in-out;`);
				// EXPL: Whenever the gutter is finished folding, clean up all freezes
				this.dom.addEventListener("transitionend", () => {
					this.view.contentDOM.removeAttribute("style");
					this.view.scrollDOM.children[0].removeAttribute("style");
					if (this.folded) {
						this.view.dom.style.setProperty("--cmtr-anno-gutter-width", "0px");
					}
				}, { once: true });
			});
		}
	}

	update(update: ViewUpdate) {
		const result = super.update(update);
		const widgets = update.state.field(annotationGutterMarkers);

		for (const transaction of update.transactions) {
			const fold_status = transaction.annotation(annotationGutterFoldAnnotation);
			const width = transaction.annotation(annotationGutterWidthAnnotation);
			const hide_empty = transaction.annotation(annotationGutterHideEmptyAnnotation);
			const fold_button = transaction.annotation(annotationGutterFoldButtonAnnotation);
			const resize_handle = transaction.annotation(annotationGutterResizeHandleAnnotation);
			if (width !== undefined) {
				this.width = width;
				if (!this.hide_on_empty && !this.folded) {
					this.dom.style.width = width + "px";
					this.setFoldButtonState();
				}
				this.view.dom.style.setProperty("--cmtr-anno-gutter-width", this.width + "px");
			}
			if (fold_status !== undefined) {
				if (fold_status === null) {
					this.folded = !this.folded;
					this.view.state.field(editorInfoField).app.workspace.requestSaveLayout();
				} else {
					this.folded = fold_status;
				}
				this.foldGutter();
			}
			if (hide_empty !== undefined) {
				this.hide_on_empty = hide_empty;
				if (this.hide_on_empty && widgets.size === 0) {
					this.dom.style.width = "0";
				} else {
					this.dom.style.width = this.width + "px";
				}
				this.view.dom.style.setProperty("--cmtr-anno-gutter-width", this.width + "px");
			}
			if (fold_button !== undefined) {
				this.add_fold_button = fold_button;
				if (this.add_fold_button && !this.fold_button_el) {
					this.createFoldButton();
				} else if (!this.add_fold_button && this.fold_button_el) {
					this.fold_button_el.remove();
					this.fold_button_el = undefined;
				}
				this.setFoldButtonState();
			}
			if (resize_handle !== undefined) {
				this.add_resize_handle = resize_handle;
				if (this.add_resize_handle && !this.resize_handle_el) {
					this.createResizeHandle();
				} else if (!this.add_resize_handle && this.resize_handle_el) {
					this.resize_handle_el.remove();
					this.resize_handle_el = undefined;
				}
			}
		}

		if (widgets.size !== update.startState.field(annotationGutterMarkers).size) {
			if (widgets.size === 0) {
				if (this.fold_button_el) {
					this.fold_button_el.style.display = "none";
				}
				if (this.resize_handle_el) {
					this.resize_handle_el.style.display = "none";
				}
				if (this.hide_on_empty) {
					this.dom.style.width = "0";
				}
			} else {
				if (this.fold_button_el) {
					this.fold_button_el.style.display = "";
				}
				if (this.resize_handle_el) {
					this.resize_handle_el.style.display = "";
				}
				if (!this.folded) {
					this.dom.style.width = this.width + "px";
				}
			}
		}

		// NOTE: Boolean returns true only if markers have changed within the viewport (so outside markers don't count)
		return result;
	}

	destroy() {
		this.fold_button_el?.remove();
		this.resize_handle_el?.remove();

		super.destroy();
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
