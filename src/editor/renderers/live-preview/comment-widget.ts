import { EditorView, WidgetType } from "@codemirror/view";

import { App, Component, editorInfoField, MarkdownRenderer, Menu, Notice, setIcon } from "obsidian";

import { addCommentToView, CM_All_Brackets, create_range, CommentRange, CriticMarkupRange } from "../../base";
import { annotationGutterFocusAnnotation } from "../gutters";
import { pluginSettingsField } from "../../uix";

import { PreviewEditor } from "../../../ui/preview-editor";
import { EmbeddableMarkdownEditor } from "../../../ui/embeddable-editor";
import { createMetadataInfoElement } from "../../../ui/snippets";

export function renderCommentWidget(app: App, range: CommentRange, text?: string, unwrap = false) {
	let str = text ?? range.text;
	if (!text && unwrap) {
		if (range.to >= str.length && !str.endsWith(CM_All_Brackets[range.type].at(-1)!))
			str = range.unwrap_bracket(true);
		else
			str = range.unwrap();
	}

	const icon = createSpan({ cls: "cmtr-comment-icon" });
	setIcon(icon, "message-square");
	let tooltip: HTMLElement | null = null;
	const component = new Component();
	icon.onmouseenter = () => {
		if (tooltip) return;

		tooltip = createDiv({ cls: "cmtr-comment-tooltip" });
		MarkdownRenderer.render(app, str, tooltip, "", component);
		component.load();
		icon!.appendChild(tooltip);

		// EXPL: Sets the tooltip position
		const icon_rect = icon!.getBoundingClientRect();
		const tooltip_rect = tooltip.getBoundingClientRect();
		tooltip.style.left = icon_rect.x - tooltip_rect.x + 12 + "px";
	};

	icon.onmouseleave = () => {
		if (tooltip) {
			component.unload();
			icon!.removeChild(tooltip!);
			tooltip = null;
		}
	};

	return icon;
}

export class CommentIconWidget extends WidgetType {
	tooltip: HTMLElement | null = null;
	icon: HTMLElement | null = null;

	component: Component;
	focused = false;
	context_menu: Menu | null = null;

	constructor(private view: EditorView, public range: CriticMarkupRange, public annotation_gutter = false) {
		super();
		this.component = new Component();
	}

	setFocused(focused: boolean) {
		this.icon!.classList.toggle("cmtr-comment-icon-focused", focused);
		this.focused = focused;
	}

	renderRange(app: App, range: CriticMarkupRange, cls: string[] = []) {
		const rangeContainer = createDiv({ cls });
		if (range.metadata) {
			rangeContainer.appendChild(createMetadataInfoElement(range, "cmtr-comment-tooltip-metadata"))
		}


		const editorContainer = rangeContainer.appendChild(createDiv());
		const editorComponent = this.component.addChild(new PreviewEditor(app, editorContainer, {
			value: range.unwrap(),
			editor_cls: ["markdown-source-view", "mod-cm6", "cmtr-comment-tooltip-editor"],
			preview_cls: ["cmtr-comment-tooltip-preview"],

			click_container: rangeContainer,

			filteredExtensions: [app.plugins.plugins["commentator"].editorExtensions],

			onSubmit: (editor) => {
				this.view.dispatch(this.view.state.update({
					changes: {
						from: range.from,
						to: range.to,
						insert: create_range(this.view.state.field(pluginSettingsField), range.type, editor.get()),
					},
				}));
			},

			isEditable: (editor) => {
				if (range.fields.author && range.fields.author !== app.plugins.plugins.commentator.settings.author) {
					new Notice("[Commentator] You cannot edit comments from other authors.");
					return false;
				}
				return true;
			}
		}));

		rangeContainer.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			e.stopPropagation();

			const menu = new Menu();
			this.context_menu = menu;
			menu.dom.addEventListener("click", () => { this.setFocused(true); });
			menu.onHide(() => { this.context_menu = null; });

			if (range.replies.length > 0) {
				menu.addItem((item) => {
					item.setTitle("Close comment thread")
						.setIcon("message-square-off")
						.setSection("close-annotation")
						.onClick(() => {
							this.view.dispatch({
								changes: {
									from: range.full_range_front,
									to: range.full_range_back,
									insert: "",
								},
							});
							this.unrenderTooltip();
						});
				});
			}

			menu.addItem((item) => {
				item.setTitle("Add reply")
					.setSection("comment-handling")
					.setIcon("reply")
					.onClick(() => {
						const replyContainer = this.tooltip!.appendChild(createDiv({ cls: "cmtr-comment-tooltip-range cmtr-comment-tooltip-reply" }));
						const replyComponent = this.component.addChild(new EmbeddableMarkdownEditor(app, replyContainer, {
							value: "",
							cls: ["markdown-source-view", "mod-cm6", "cmtr-comment-tooltip-editor"],
							filteredExtensions: [app.plugins.plugins["commentator"].editorExtensions],

							onSubmit: (editor) => {
								this.view.dispatch(this.view.state.update({
									changes: {
										from: range.full_range_back,
										to: range.full_range_back,
										insert: create_range(this.view.state.field(pluginSettingsField), range.type, editor.get()),
									},
								}));
								this.unrenderTooltip();
							},
							onEscape: () => {
								replyComponent.unload();
								replyContainer.remove();
							},
							onBlur: () => {
								replyComponent.unload();
								replyContainer.remove();
							}
						}));
					});
			});

			menu.addItem((item) => {
				item.setTitle("Edit comment")
					.setIcon("pencil")
					.setSection("comment-handling")
					.onClick(() => {
						editorComponent.setMode("edit");
					});
			});

			menu.addItem((item) => {
				item.setTitle("Remove comment")
					.setIcon("cross")
					.setSection("comment-handling")
					.onClick((e) => {
						this.tooltip!.removeChild(rangeContainer);
						this.view.dispatch({ changes: { from: range.from, to: range.to, insert: "" } });
						editorComponent.unload();
					});
			});


			menu.showAtMouseEvent(e);
		});

		return rangeContainer;
	}

	renderTooltip() {
		if (!this.tooltip) {
			const { app } = this.view.state.field(editorInfoField);

			this.tooltip = createDiv({ cls: "cmtr-comment-tooltip popover hover-popover" });
			this.component.registerDomEvent(document, "click", (e: MouseEvent) => {
				if (this.tooltip && !(this.context_menu && this.context_menu.dom.contains(e.target as HTMLElement))) {
					if (!this.tooltip.contains(e.target as HTMLElement)) {
						this.unrenderTooltip();
						this.setFocused(false);
					} else {
						this.setFocused(true);
						e.stopPropagation();
					}
				}
			});
			this.tooltip.addEventListener("mouseleave", (e) => {
				if (!this.focused && !this.context_menu && !this.tooltip!.contains(e.relatedTarget as HTMLElement)) {
					this.unrenderTooltip();
				}
			});

			// EXPL: Render the comment range and all replies
			this.tooltip.appendChild(this.renderRange(app, this.range, ["cmtr-comment-tooltip-range cmtr-comment-tooltip-base"]));
			for (const reply of this.range.replies) {
				this.tooltip.appendChild(this.renderRange(app, reply, ["cmtr-comment-tooltip-range", "cmtr-comment-tooltip-reply"]));
			}
			this.component.load();
			document.body.appendChild(this.tooltip);

			// EXPL: Set tooltip position and avoid clipping outside editor area
			const icon_rect = this.icon!.getBoundingClientRect();
			const tooltip_rect = this.tooltip.getBoundingClientRect();
			const content_rect = this.view.contentDOM.getBoundingClientRect();
			const preferredXPosition = Math.clamp(
				icon_rect.x - tooltip_rect.x - tooltip_rect.width / 2 + 12,
				app.vault.getConfig("readableLineLength") ? 0 : content_rect.x,
				content_rect.x + content_rect.width - tooltip_rect.width - 12
			);
			const preferredYPosition = icon_rect.y + (
				icon_rect.height + tooltip_rect.height > this.view.scrollDOM.clientHeight ?
					- tooltip_rect.height :
					icon_rect.height
			) + 4;

			this.tooltip.style.left = preferredXPosition + "px";
			this.tooltip.style.top = preferredYPosition + "px";
		}
	}

	focusAnnotation(e: Event) {
		// TODO: Check if this is (much) worse than directly invoking the focus annotation function from the gutter plugin instance
		//      The other options can piggy-back on already existing transactions, and just annotating them
		//      However, this one doesn't have one (except if clicking on the widget _is_ a transaction)
		this.view.dispatch({ annotations: [ annotationGutterFocusAnnotation.of({ from: this.range.from, to: this.range.to }) ] });
	}

	unrenderTooltip() {
		this.component.unload();
		if (this.tooltip) {
			this.tooltip.remove();
			this.tooltip = null;
		}
		this.setFocused(false);
	}

	toDOM(view: EditorView): HTMLElement {
		this.icon = createSpan({ cls: "cmtr-comment-icon" });
		setIcon(this.icon, "message-square");

		// DEBUG: Add line under icon to check alignment of annotation gutter element with widget
		// this.icon.appendChild(createDiv({ cls: "cmtr-debug-comment-line" }));

		if (this.annotation_gutter) {
			this.icon.onclick = (e) => this.focusAnnotation(e);
			this.icon.oncontextmenu = (e) => {
				e.preventDefault();

				const menu = new Menu();
				menu.addItem((item) => {
					item.setTitle("Close comment thread")
						.setIcon("message-square-off")
						.setSection("close-annotation")
						.onClick(() => {
							this.view.dispatch({
								changes: {
									from: this.range.full_range_front,
									to: this.range.full_range_back,
									insert: "",
								},
							});
						});
				});

				menu.addItem((item) => {
					item.setTitle("Focus annotation")
						.setSection("comment-handling")
						.setIcon("eye")
						.onClick((e) => this.focusAnnotation(e));
				});
				menu.addItem((item) => {
					item.setTitle("Add comment")
						.setSection("comment-handling")
						.setIcon("message-square")
						.onClick((e) => {
							e.preventDefault();
							addCommentToView(view, this.range);
						});
				});

				menu.showAtMouseEvent(e);
			};
		}

		if (this.range.length) {
			this.icon.onmouseenter = () => {
				this.renderTooltip();
			};
			this.icon.onclick = (e) => {
				this.renderTooltip();
				this.setFocused(true);
				this.focusAnnotation(e);
				e.stopPropagation();
			};

			this.icon.onmouseleave = (e) => {
				if (!this.focused && !this.context_menu && this.tooltip && !(
					this.tooltip.contains(e.relatedTarget as HTMLElement) ||
					// TODO: Find a better way to expand the icon's "hover area", padding/::before doesn't work
					//       Currently, unrendering can be avoided by sneaking to the right when leaving the icon
					// NOTE: Creates a small area below the icon to not trigger the tooltip unrendering
					this.icon!.getBoundingClientRect().bottom - e.clientY < 6
				)) {
					this.unrenderTooltip();
					this.focused = false;
				}
			};
		}

		return this.icon;
	}

	destroy(dom: HTMLElement){
		this.unrenderTooltip();
	 	super.destroy(dom);
	}
}
