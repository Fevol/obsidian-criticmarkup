import { type Editor, type MarkdownView, Platform } from "obsidian";

import type CommentatorPlugin from "../../main";
import { type ECommand, EditMode } from "../../types";
import { type SelectionRange } from "@codemirror/state";

import {
	acceptSuggestions, applyToText,
	CM_SuggestionTypes,
	mark_editor_ranges,
	rangeParser,
	rejectSuggestions,
	selectionContainsRanges,
} from "../base";
import { addCommentToView, generateCriticMarkupPatchFromDiff } from "../base";
import {
	editMode,
	editModeValue,
	editModeValueState,
	previewMode,
	previewModeState,
} from "../settings";
import { getEditMode } from "./extensions/editing-modes";
import { showProgressBarNotice } from "../../util/obsidian-util";
import { annotationGutterFoldAnnotation } from "../renderers/gutters";
import {pathWithoutExtension} from "../../util/util";

export const debug_application_commands = (plugin: CommentatorPlugin) => [
	{
		id: "toggle-vim",
		name: "(DEBUG) Toggle Vim mode",
		icon: "comment",
		regular_callback: async () => {
			plugin.app.vault.setConfig("vimMode", !plugin.app.vault.getConfig("vimMode"));
		},
	},
	{
		id: "progress-bar-notice",
		name: "(DEBUG) Test Progress Bar Notice",
		callback: async () => {
			const progressBarUpdate = showProgressBarNotice("Test progress bar", "Test progress bar finished", 10, 1000, "Test");
			for (let i = 0; i < 10; i++) {
				progressBarUpdate(i + 1);
				await new Promise(resolve => activeWindow.setTimeout(resolve, 300));
			}
		}
	},
];


export const suggestion_commands: (plugin: CommentatorPlugin) => ECommand[] = (plugin) =>
	Object.entries(CM_SuggestionTypes).map(([text, type]) => ({
		id: `toggle-${text.toLowerCase()}`,
		name: `Mark as ${text}`,
		icon: text.toLowerCase(),
		editor_context: true,
		regular_callback: (editor: Editor, view: MarkdownView) => {
			mark_editor_ranges(editor, type, plugin.settings);
		},
	}));

export const editor_commands: (plugin: CommentatorPlugin) => ECommand[] = (plugin) => [
	{
		id: "accept-all-suggestions",
		name: "Accept all suggestions",
		icon: "check-check",
		editor_context: true,
		regular_callback: (editor: Editor, _) => {
			// TODO: Add warning is #ranges > 100 ('Are you sure you want to accept all suggestions?')
			editor.cm.dispatch(editor.cm.state.update({
				changes: acceptSuggestions(editor.cm.state),
			}));
		},
	},
	{
		id: "reject-all-suggestions",
		name: "Reject all suggestions",
		icon: "cross",
		editor_context: true,
		regular_callback: (editor: Editor, _) => {
			editor.cm.dispatch(editor.cm.state.update({
				changes: rejectSuggestions(editor.cm.state),
			}));
		},
	},
	{
		id: "accept-selected-suggestions",
		name: "Accept suggestions in selection",
		icon: "check",
		editor_context: true,
		check_callback: (checking: boolean, editor: Editor, _) => {
			const contains_range = selectionContainsRanges(editor.cm.state);
			if (checking || !contains_range)
				return contains_range;
			const selections = editor.cm.state.selection.ranges;
			// @ts-expect-error Somehow selections is any (while ranges is defined)
			const changes = selections.map(selection =>
				acceptSuggestions(editor.cm.state, selection.from, selection.to)
			);
			editor.cm.dispatch(editor.cm.state.update({
				changes,
			}));
		},
	},
	{
		id: "reject-selected-suggestions",
		name: "Reject suggestions in selection",
		icon: "cross",
		editor_context: true,
		check_callback: (checking: boolean, editor: Editor, _) => {
			const contains_range = selectionContainsRanges(editor.cm.state);
			if (checking || !contains_range)
				return contains_range;
			const selections = editor.cm.state.selection.ranges;
			const changes = selections.map((selection: SelectionRange) =>
				rejectSuggestions(editor.cm.state, selection.from, selection.to)
			);
			editor.cm.dispatch(editor.cm.state.update({
				changes,
			}));
		},
	},
	{
		id: "comment",
		name: "Add comment",
		icon: "message-square",
		editor_context: true,
		regular_callback: (editor: Editor, _) => {
			addCommentToView(
				editor.cm,
				editor.cm.state.field(rangeParser).ranges.at_cursor(editor.cm.state.selection.main.head),
			);
		},
	},
	{
		id: "fold-gutter",
		name: "Fold annotation gutter",
		icon: "arrow-right-from-line",
		editor_context: true,
		regular_callback: (editor: Editor, _) => {
			editor.cm.dispatch({
				annotations: [
					annotationGutterFoldAnnotation.of(null)
				]
			});
		},
	},
	{
		id: "toggle-preview-mode",
		name: "Cycle preview mode",
		icon: "comment",
		editor_context: true,
		regular_callback: (editor: Editor, view: MarkdownView) => {
			const resulting_mode = (editor.cm.state.facet(previewModeState) + 1) % 3;
			editor.cm.dispatch(editor.cm.state.update({
				effects: previewMode.reconfigure(previewModeState.of(resulting_mode)),
			}));
			plugin.setPreviewMode(view, resulting_mode);
		},
	},
	{
		id: "suggest-mode",
		name: "Toggle suggestion mode",
		icon: "file-edit",
		editor_context: true,
		regular_callback: (editor: Editor, view: MarkdownView) => {
			const current_value = editor.cm.state.facet(editModeValueState);
			const resulting_mode = current_value === EditMode.SUGGEST ? EditMode.CORRECTED : EditMode.SUGGEST;
			editor.cm.dispatch(editor.cm.state.update({
				effects: [
					editModeValue.reconfigure(editModeValueState.of(resulting_mode)),
					editMode.reconfigure(getEditMode(resulting_mode, plugin.settings)),
				],
			}));
			plugin.setEditMode(view, resulting_mode);
		},
	},
	{
		id: "generate-text-diff",
		name: "Generate text diff from clipboard",
		icon: "diff",
		editor_context: true,
		regular_callback: async (editor: Editor, _) => {
			const newText = await navigator.clipboard.readText();
			const ranges = editor.cm.state.field(rangeParser).ranges;
			const selection = editor.cm.state.selection.main;
			// TODO: Split up edges of ranges in selection
			// TODO: Do not diff on comments
			const oldText = ranges.unwrap_in_range(editor.cm.state.doc, selection.from, selection.to).output;

			const diff = generateCriticMarkupPatchFromDiff(plugin.settings, oldText, newText);

			editor.cm.dispatch(editor.cm.state.update({
				changes: [{
					from: selection.from,
					to: selection.to,
					insert: diff,
				}],
			}));
		},
	},
	{
		id: "save-clean-copy",
		name: Platform.isMacOS ? "Duplicate current file without markup" : "Make a copy of the current file without markup",
		icon: "copy",
		editor_context: true,
		regular_callback: async (editor: Editor, view: MarkdownView) => {
			if (view.file) {
				const new_path = plugin.app.vault.getAvailablePath(pathWithoutExtension(view.file.path), view.file.extension)
				const original_content = await plugin.app.vault.read(view.file);
				const new_file = await plugin.app.vault.copy(view.file, new_path);
				const new_content = applyToText(
					original_content,
					(range, text) => range.unwrap(),
					editor.cm.state.field(rangeParser).ranges.ranges
				);
				await plugin.app.vault.modify(new_file, new_content)
				await plugin.app.workspace.getLeaf("tab").openFile(new_file, {
					active: true,
					eState: { rename: "all"}
				});
			}
		}
	}
];

export const application_commmands = (plugin: CommentatorPlugin): ECommand[] => [
	{
		id: "view",
		name: "Open global annotation view",
		icon: "comment",
		regular_callback: async () => {
			await plugin.activateView();
		},
	}
];

export const commands: (plugin: CommentatorPlugin) => ECommand[] = (plugin) =>
	initializeCommands(
		[
			...suggestion_commands(plugin),
			...editor_commands(plugin),
			...application_commmands(plugin),
			...(process.env.NODE_ENV === "development" ? debug_application_commands(plugin) : [])
		],
	);

/**
 * Automatically assigns correct callback to commands
 * @param commands Commands to initialize
 * @remark This results in non-editor callback commands also being available in the mobile toolbar
 */
export function initializeCommands(commands: ECommand[]) {
	for (const command of commands) {
		if (Platform.isMobile || command.editor_context) {
			if (command.regular_callback) {
				command.editorCallback = command.regular_callback;
				delete command.regular_callback;
			} else {
				command.editorCheckCallback = command.check_callback;
				delete command.check_callback;
			}
		} else {
			if (command.regular_callback) {
				command.callback = command.regular_callback;
				delete command.regular_callback;
			} else {
				command.checkCallback = command.check_callback;
				delete command.check_callback;
			}
		}
	}
	return commands;
}
