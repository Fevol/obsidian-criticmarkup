import type { EventRef, MarkdownView } from "obsidian";
import type { SelectionRange } from "@codemirror/state";
import type CommentatorPlugin from "../../main";

import { acceptSuggestions, addCommentToView, isCursor, rangeParser, rejectSuggestions } from "../base";

import { annotationGutterIncludedTypes, annotationGutterIncludedTypesState } from "../settings";
import { annotationGutterFoldAnnotation } from "../renderers/gutters";
import { AnnotationInclusionType } from "../../constants";

import { stickyContextMenuPatch } from "../../patches";

export const cmenuGlobalCommands: (plugin: CommentatorPlugin) => EventRef = (plugin) =>
	plugin.app.workspace.on("editor-menu", (menu, editor) => {
		const ranges = editor.cm.state.field(rangeParser).ranges;
		menu.addItem((item) => {
			item.setTitle("Add comment")
				.setIcon("message-square")
				.setSection("commentator")
				.onClick(() => {
					addCommentToView(editor.cm, ranges.at_cursor(editor.cm.state.selection.main.head));
				});
		});

		if (ranges.contains_range(editor.cm.state.selection.main.from, editor.cm.state.selection.main.to)) {
			menu.addItem((item) => {
				item.setTitle("Accept changes")
					.setIcon("check")
					.setSection("commentator")
					.onClick(() => {
						const selections: SelectionRange[] = editor.cm.state.selection.ranges;
						const changes = selections.map(selection =>
							acceptSuggestions(editor.cm.state, selection.from, selection.to)
						);
						editor.cm.dispatch(editor.cm.state.update({
							changes,
						}));
					});
			});

			menu.addItem((item) => {
				item.setTitle("Reject changes")
					.setIcon("cross")
					.setSection("commentator")
					.onClick(() => {
						const selections = editor.cm.state.selection.ranges;
						// @ts-expect-error Somehow selections is any (while ranges is defined)
						const changes = selections.map(selection =>
							rejectSuggestions(editor.cm.state, selection.from, selection.to)
						);
						editor.cm.dispatch(editor.cm.state.update({
							changes,
						}));
					});
			});

			if (isCursor(editor.cm.state.selection)) {
				const range = editor.cm.state.field(rangeParser).ranges.at_cursor(
					editor.cm.state.selection.ranges[0].head,
				)!;

				menu.addItem((item) => {
					const submenu = item.setTitle("Set metadata")
						.setIcon("tags")
						.setSection("commentator")
						.setSubmenu();

					submenu.addItem((item) => {
						item.setTitle("Set author")
							.setIcon("lucide-user")
							.onClick(() => {
								editor.cm.dispatch(editor.cm.state.update({
									changes: range.add_metadata("author", plugin.settings.author),
								}));
							});
					});
					submenu.addItem((item) => {
						item.setTitle("Set time")
							.setIcon("lucide-calendar")
							.onClick(() => {
								editor.cm.dispatch(editor.cm.state.update({
									changes: range.add_metadata("time", Math.round(Date.now() / 1000)),
								}));
							});
					});
					submenu.addItem((item) => {
						item.setTitle("Set completed")
							.setIcon("lucide-check")
							.onClick(() => {
								editor.cm.dispatch(editor.cm.state.update({
									changes: range.add_metadata("done", true),
								}));
							});
					});
				});
			}
		}
	});

export const cmenuViewportCommands: (plugin: CommentatorPlugin) => EventRef = (plugin) =>
	plugin.app.workspace.on("markdown-viewport-menu", (menu, view, sectionName, menuItem) => {
		if (plugin.settings.annotation_gutter) {
			const editor_cm = (view as unknown as MarkdownView).editor.cm;
			let current_settings = editor_cm.state.field(annotationGutterIncludedTypesState);
			stickyContextMenuPatch(true);

			menu.addItem((item) => {
				item.setTitle("Fold gutter")
					.setIcon("arrow-right-from-line")
					.setSection("commentator")
					.onClick(() => {
						editor_cm.dispatch(editor_cm.state.update({
							annotations: [ annotationGutterFoldAnnotation.of(null) ]
						}));
					});
			});

			menu.addItem((item) => {
				const submenu = item.setTitle("Included annotations")
										.setIcon("eye")
										.setSection("commentator")
										.setSubmenu();

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
                                item.setChecked((current_settings & value) !== 0);
								editor_cm.dispatch(editor_cm.state.update({
									effects: [annotationGutterIncludedTypes.reconfigure(annotationGutterIncludedTypesState.of(current_settings))],
								}));
							});
					});
				}
			});
		}
	});
