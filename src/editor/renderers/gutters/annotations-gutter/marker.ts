import {type EditorState, Range, RangeSet, StateField} from "@codemirror/state";
import {EditorView, GutterMarker} from "@codemirror/view";

import {Component, editorEditorField, editorInfoField, MarkdownRenderer, Menu, Notice} from "obsidian";

import {COMMENTATOR_GLOBAL} from "../../../../global";
import {EmbeddableMarkdownEditor} from "../../../../ui/embeddable-editor";
import {acceptSuggestions, CriticMarkupRange, rangeParser, rejectSuggestions, SuggestionType} from "../../../base";
import {create_range} from "../../../base/edit-util/range-create";
import {addCommentToView, annotationGutter} from "./index";
import {AnnotationInclusionType} from "../../../../constants";
import {annotationGutterIncludedTypes, annotationGutterIncludedTypesState} from "../../../settings";
import type {AnnotationGutterView} from "./annotation-gutter";
import {keepContextMenuOpen} from "../../../../patches";

class AnnotationNode extends Component {
	text: string;
	new_text: string | null = null;
	annotation_container: HTMLElement;
	metadata_view: HTMLElement | null = null;
	annotation_view: HTMLElement;

	currentMode: "preview" | "source" | null = null;
	editMode: EmbeddableMarkdownEditor | null = null;

	constructor(public range: CriticMarkupRange, public marker: AnnotationMarker) {
		super();

		this.text = range.unwrap();

		this.annotation_container = this.marker.annotation_thread.createDiv({ cls: "cmtr-anno-gutter-annotation" });
		this.annotation_container.addEventListener("blur", this.renderPreview.bind(this));
		this.annotation_container.addEventListener("dblclick", this.renderSource.bind(this));
		this.annotation_container.addEventListener("contextmenu", this.onCommentContextmenu.bind(this));

		if (this.range.metadata)
			this.renderMetadata();

		this.annotation_view = this.annotation_container.createDiv({ cls: "cmtr-anno-gutter-annotation-view" });
		this.renderPreview();
	}

	onload() {
		super.onload();
	}

	onunload() {
		super.onunload();

		this.annotation_container.remove();
		this.editMode = null;
	}

	renderMetadata() {
		this.metadata_view = this.annotation_container.createDiv({ cls: "cmtr-anno-gutter-annotation-metadata" });
		if (this.range.fields.author) {
			const authorLabel = createSpan({
				cls: "cmtr-anno-gutter-annotation-author-label",
				text: "Author: ",
			});
			this.metadata_view.appendChild(authorLabel);

			const author = createSpan({
				cls: "cmtr-anno-gutter-annotation-author-name",
				text: this.range.fields.author,
			});
			this.metadata_view.appendChild(author);
		}

		if (this.range.fields.time) {
			if (this.metadata_view.children.length > 0) {
				const separator = createSpan({
					cls: "cmtr-anno-gutter-annotation-metadata-separator",
					text: " • ",
				});
				this.metadata_view.appendChild(separator);
			}

			const timeLabel = createSpan({
				cls: "cmtr-anno-gutter-annotation-time-label",
				text: "Updated at: ",
			});
			this.metadata_view.appendChild(timeLabel);

			const time = createSpan({
				cls: "cmtr-anno-gutter-annotation-time",
				text: window.moment.unix(this.range.fields.time!).format("MMM DD YYYY, HH:mm"),
			});
			this.metadata_view.appendChild(time);
		}
	}

	renderSource(e?: MouseEvent) {
		if (this.range.type !== SuggestionType.COMMENT) {
			// TODO: Should editing non-comments within the annotation gutter be allowed?
			new Notice("[Commentator] You can only edit comments.")
		} else {
			e?.stopPropagation();
			if (this.currentMode === "source") return;

			this.annotation_container.toggleClass("cmtr-anno-gutter-annotation-editing", true);
			if (this.range.fields.author && this.range.fields.author !== COMMENTATOR_GLOBAL.PLUGIN_SETTINGS.author) {
				new Notice("[Commentator] You cannot edit comments from other authors.");
				return;
			}

			this.annotation_view.empty();
			this.editMode = this.addChild(
				new EmbeddableMarkdownEditor(COMMENTATOR_GLOBAL.app, this.annotation_view, {
					value: this.text,
					cls: "cmtr-anno-gutter-annotation-editor",
					onSubmit: (editor) => {
						this.new_text = editor.get();
						this.renderPreview();
					},
					// TODO: Get a reference to the plugin somehow
					filteredExtensions: [COMMENTATOR_GLOBAL.app.plugins.plugins["commentator"].editorExtensions],
					onBlur: this.renderPreview.bind(this),
				}),
			);
			this.currentMode = "source";
		}
	}

	renderPreview() {
		if (this.currentMode === "preview") return;

		// FIXME: On accepting a new comment (on mod+enter), this function gets called twice
		//    Once for the immediate user event
		//    And again when the comments get updated
		//    -> This caused an issue where the range gets added twice, temporarily fixed by setting text to new text
		this.annotation_container.toggleClass("cmtr-anno-gutter-annotation-editing", false);

		// EXPL: Regular (re-)rendering of the annotation
		if (this.text === this.new_text || this.new_text === null) {
			this.new_text = null;
			if (this.editMode) {
				this.removeChild(this.editMode);
				this.editMode = null;
			}
			this.annotation_view.empty();
			if (this.range.type !== SuggestionType.SUBSTITUTION) {
				MarkdownRenderer.render(COMMENTATOR_GLOBAL.app, this.text || "&nbsp;", this.annotation_view, "", this);
				switch (this.range.type) {
					case SuggestionType.ADDITION:
						this.annotation_view.children[0].prepend(createSpan({ cls: "cmtr-anno-gutter-annotation-desc", text: "Added: " }));
						break;
					case SuggestionType.DELETION:
						this.annotation_view.children[0].prepend(createSpan({ cls: "cmtr-anno-gutter-annotation-desc", text: "Deleted: " }));
						break;
					case SuggestionType.HIGHLIGHT:
						break;
					case SuggestionType.COMMENT:
						break;
				}
			} else {
				const text_slices = this.range.unwrap_parts();
				MarkdownRenderer.render(COMMENTATOR_GLOBAL.app, text_slices[0] || "&nbsp;", this.annotation_view, "", this);
				this.annotation_view.children[0].prepend(createSpan({ cls: "cmtr-anno-gutter-annotation-desc", text: "Changed: " }));
				const childIdx = this.annotation_view.children.length;
				MarkdownRenderer.render(COMMENTATOR_GLOBAL.app, text_slices[1] || "&nbsp;", this.annotation_view, "", this);
				this.annotation_view.children[childIdx].prepend(createSpan({ cls: "cmtr-anno-gutter-annotation-desc", text: "To: " }));
			}

			this.annotation_view.addClass("cmtr-anno-gutter-annotation-" + this.range.type);
			this.currentMode = "preview";
		}

		// EXPL: The annotation gets updated with new text
		else {
			this.text = this.new_text;
			setTimeout(() =>
				this.marker.view.dispatch({
					changes: {
						from: this.range.from,
						to: this.range.to,
						insert: create_range(SuggestionType.COMMENT, this.new_text!),
					},
				})
			);
		}
	}

	onCommentContextmenu(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();

		keepContextMenuOpen(true);

		const menu = new Menu();
		menu.addItem((item) => {
			item.setTitle("Add reply")
				.setSection("range-controls")
				.setIcon("reply")
				.onClick(() => {
					addCommentToView(this.marker.view, this.range);
				});
		});

		if (this.range.type === SuggestionType.COMMENT) {
			menu.addItem((item) => {
				item.setTitle("Edit comment")
					.setIcon("pencil")
					.setSection("range-controls")
					.onClick(() => {
						this.renderSource();
					});
			});
			// TODO: When removing comments, use a handler function that determines whether it should be archived or not
			menu.addItem((item) => {
				item.setTitle("Remove comment")
					.setIcon("cross")
					.setSection("range-controls")
					.onClick(() => {
						this.marker.view.dispatch({ changes: { from: this.range.from, to: this.range.to, insert: "" } });
					});
			});
			if (this.range.replies.length > 0) {
				menu.addItem((item) => {
					item.setTitle("Remove comment thread")
						.setIcon("trash")
						.setSection("range-controls")
						.onClick(() => {
							this.marker.view.dispatch({
								changes: {
									from: this.range.full_range_front,
									to: this.range.full_range_back,
									insert: "",
								},
							});
						});
				});
			}
		} else if (this.range.type !== SuggestionType.HIGHLIGHT) {
			menu.addItem((item) => {
				item.setTitle("Accept changes")
					.setIcon("check")
					.setSection("range-controls")
					.onClick(() => {
						this.marker.view.dispatch({ changes: acceptSuggestions(this.marker.view.state, this.range.from, this.range.to) });
					});
			});
			menu.addItem((item) => {
				item.setTitle("Reject changes")
					.setIcon("cross")
					.setSection("range-controls")
					.onClick(() => {
						this.marker.view.dispatch({ changes: rejectSuggestions(this.marker.view.state, this.range.from, this.range.to) });
					});
			});
			if (this.range.replies.length > 0) {
				menu.addItem((item) => {
					item.setTitle("Remove all comments")
						.setIcon("trash")
						.setSection("range-controls")
						.onClick(() => {
							this.marker.view.dispatch({
								changes: {
									from: this.range.replies[0].from,
									to: this.range.replies[this.range.replies.length - 1].to,
									insert: "",
								},
							});
						});
				});
			}
		}

		menu.addItem((item) => {
			item.setTitle("Fold gutter")
				.setSection("gutter-controls")
				.setIcon("arrow-right-from-line")
				.onClick(() => {
					// FIXME: Remove direct access of gutter, prefer fold annotation?
					this.marker.view.plugin(annotationGutter(COMMENTATOR_GLOBAL.app)[1][0][0])!.foldGutter();
				});
		});
		menu.addItem((item) => {
			const submenu = item.setTitle("Included annotations")
				.setIcon("eye")
				.setSection("gutter-controls")
				.setSubmenu();

			let current_settings = this.marker.view.state.facet(annotationGutterIncludedTypesState);

			for (const { title, icon, value } of [
				{ title: "Additions", icon: "plus-circle", value: AnnotationInclusionType.ADDITION },
				{ title: "Deletions", icon: "minus-square", value: AnnotationInclusionType.DELETION },
				{ title: "Substitutions", icon: "replace", value: AnnotationInclusionType.SUBSTITUTION },
				{ title: "Highlights", icon: "highlighter", value: AnnotationInclusionType.HIGHLIGHT },
				{ title: "Comments", icon: "message-square", value: AnnotationInclusionType.COMMENT },
			]) {
				submenu.addItem((item) => {
					item.setTitle(title)
						.setIcon(icon)
						.setChecked((current_settings & value) !== 0)
						.onClick(() => {
							current_settings ^= value;
							const is_active = (current_settings & value) !== 0;
							// FIXME: After calling .setChecked(false) once, the icon will not show up again when calling .setChecked(true)
							// 		the code below bypasses this issue by just hiding it via display style
							if (item.checkIconEl)
								item.checkIconEl.style.display = is_active ? "flex" : "none";
							else
								item.setChecked(is_active);
							this.marker.view.dispatch(this.marker.view.state.update({
								effects: [annotationGutterIncludedTypes.reconfigure(annotationGutterIncludedTypesState.of(current_settings))],
							}));
						});
				});
			}
		});

		menu.showAtPosition(e);
	}
}

export class AnnotationMarker extends GutterMarker {
	annotation_thread!: HTMLElement;
	component: Component = new Component();
	preventUnload: boolean = false;

	constructor(public annotation: CriticMarkupRange, public annotations: CriticMarkupRange[], public view: EditorView, public itr = 0) {
		super();
	}

	eq(other: AnnotationMarker) {
		return this.itr === other.itr && this.annotations === other.annotations && this.annotations[0].equals(other.annotations[0]);
	}

	onCommentThreadClick() {
		const { app } = this.view.state.field(editorInfoField);
		// EXPL: When the annotation gets focused, ensure that it is aligned to the block it is attached to,
		// 		 pushing other annotations up/down
		// NOTE: This is very dirty access of the annotation gutter plugin, but the alternative
		// 		 is that we create an annotation for both moving the gutter (containing this marker),
		// 		 as well as a focus annotation, which seems far too roundabout
		// FIXME: Remove direct access of gutter, prefer annotation?
		const gutter = this.view.plugin(annotationGutter(app)[1][0][0]) as AnnotationGutterView;
		gutter.unfocusAnnotation();
		gutter.focusAnnotation(this, -1, true, true);

		this.annotation_thread.classList.toggle("cmtr-anno-gutter-thread-highlight", true);
	}

	toDOM() {
		this.annotation_thread = createDiv({ cls: "cmtr-anno-gutter-thread" });
		this.annotation_thread.addEventListener("click", this.onCommentThreadClick.bind(this));

		for (const range of this.annotations)
			this.component.addChild(new AnnotationNode(range, this));
		this.component.load();

		return this.annotation_thread;
	}

	focus() {
		this.annotation_thread.focus();
	}

	focus_annotation(index: number = -1, scroll: boolean = false) {
		if (index === -1) {
			this.annotation_thread.classList.toggle("cmtr-anno-gutter-thread-highlight", true);
		} else if (index >= 0 && index < this.annotation_thread.children.length) {
			this.annotation_thread.children.item(index)!.dispatchEvent(new MouseEvent("dblclick"));
		} else {
			console.error("[Commentator] Invalid index for focusing annotation:", index);
		}

		if (scroll) {
			setTimeout(() => {
				const top = this.view.lineBlockAt(this.annotations[0].from).top - 100;
				this.view.scrollDOM.scrollTo({top, behavior: "smooth"});
			}, 200);
		}
	}

	unfocus_annotation(index: number = -1) {
		if (index === -1) {
			this.annotation_thread.classList.toggle("cmtr-anno-gutter-thread-highlight", false);
		} else {
			this.annotation_thread.children.item(index)!.classList.toggle("cmtr-anno-gutter-thread-highlight", false);
		}
	}

	destroy(dom: HTMLElement) {
		this.component.unload();
		this.annotation_thread.remove();
		super.destroy(dom);
	}
}

function createMarkers(state: EditorState, changed_ranges: CriticMarkupRange[], types: number) {
	const view = state.field(editorEditorField);

	const includeAdditions = (types & AnnotationInclusionType.ADDITION) !== 0;
	const includeDeletions = (types & AnnotationInclusionType.DELETION) !== 0;
	const includeSubstitutions = (types & AnnotationInclusionType.SUBSTITUTION) !== 0;
	const includeHighlights = (types & AnnotationInclusionType.HIGHLIGHT) !== 0;
	const includeComments = (types & AnnotationInclusionType.COMMENT) !== 0;

	const cm_ranges: Range<AnnotationMarker>[] = [];
	for (const range of changed_ranges) {
		let full_thread = range.full_thread;

		if (!includeComments) {
			full_thread = full_thread.slice(0, 1);
		}

		switch (range.type) {
			case SuggestionType.ADDITION:
				if (!includeAdditions) full_thread.shift();
				break;
			case SuggestionType.DELETION:
				if (!includeDeletions) full_thread.shift();
				break;
			case SuggestionType.SUBSTITUTION:
				if (!includeSubstitutions) full_thread.shift();
				break;
			case SuggestionType.HIGHLIGHT:
				if (!includeHighlights) full_thread.shift();
				break;
			case SuggestionType.COMMENT:
				if (!includeComments) full_thread.shift();
				break;
		}

		if (full_thread.length) {
			// MODIFICATION: advanceCursor in base.ts required markers to be inserted into the rangeset at exactly
			//      the positions where line starts, this caused some issues with correct adjustment of positions through updates,
			//      so adjustment is that markers can now occur at any position before the start of the line
			const marker = new AnnotationMarker(range, full_thread, view, itr);
			marker.preventUnload = true;
			cm_ranges.push(marker.range(range.from, range.to));
		}
	}

	return cm_ranges;
}

let itr = 0;
export const annotationGutterMarkers = StateField.define<RangeSet<AnnotationMarker>>({
	create(state) {
		const ranges = state.field(rangeParser).ranges.ranges.reduce((acc, range) => {
			const base = range.base_range;
			if (!acc.includes(base))
				acc.push(base);
			return acc;
		}, [] as CriticMarkupRange[]);

		return RangeSet.of<AnnotationMarker>(
			createMarkers(
				state,
				ranges,
				state.facet(annotationGutterIncludedTypesState)
			)
		);
	},

	update(oldSet, tr) {
		const includedTypes = tr.state.facet(annotationGutterIncludedTypesState);

		// NOTE: While it is *slightly* inefficient to recreate all markers (since the existing markers could be re-used),
		//       the included types are barely ever changed, so the impact is negligible
		if (tr.startState.facet(annotationGutterIncludedTypesState) !== includedTypes) {
			return this.create(tr.state);
		}

		if (!tr.docChanged) {
			return oldSet;
		}

		itr += 1;

		const added_ranges: CriticMarkupRange[] = [];
		for (const range of tr.state.field(rangeParser).inserted_ranges) {
			if (!added_ranges.includes(range.base_range))
				added_ranges.push(range.base_range);
		}
		const deleted_ranges = tr.state.field(rangeParser).deleted_ranges
			.map(range => range.base_range);

		return oldSet
			.map(tr.changes)
			.update({
				filter: (from, to, value) => {
					// EXPL: This code prevents AnnotationMarkers in existing GutterMarkers from being unloaded
					//       when the marker is moved from one GutterElement to another
					const keep = !deleted_ranges.includes(value.annotation);
					value.preventUnload = keep;
					return keep;

					// return !deleted_ranges.includes(value.annotation);
				},
				add: createMarkers(tr.state, added_ranges.map(range => range.full_thread[0]), includedTypes),
			});
	},
});
