import type CommentatorPlugin from "../../main";
import { editModeValueState, previewModeState } from "../settings";
import { HeaderButton } from "./header-button";

export const previewModeHeaderButton = (plugin: CommentatorPlugin, render: boolean) =>
	new HeaderButton(
		[
			{
				icon: "message-square",
				tooltip: "Current mode: show all suggestions\nClick to preview 'accept all'",
				text: "Showing all suggestions",
			},
			{
				icon: "check",
				tooltip: "Current mode: preview 'accept all'\nClick to preview 'reject all'",
				text: "Previewing \"accept all\"",
			},
			{
				icon: "cross",
				tooltip: "Current mode: preview 'reject all'\nClick to preview 'show all'",
				text: "Previewing \"reject all\"",
			},
		],
		plugin.settings.toolbar_show_buttons_labels,
		"cmtr-suggestion-status",
		plugin.setPreviewMode.bind(plugin),
		(view) => view.editor.cm.state.facet(previewModeState),
		plugin,
		render,
	);

export const editModeHeaderButton = (plugin: CommentatorPlugin, render: boolean) =>
	new HeaderButton(
		[
			{
				icon: "pencil",
				tooltip: "Current mode: editing (regular)\nClick to edit (corrected)",
				text: "Editing (REG)",
			},
			{ icon: "edit", tooltip: "Current mode: editing (corrected)\nClick to suggest", text: "Editing (ALT)" },
			{ icon: "file-edit", tooltip: "Current mode: suggesting\nClick to edit (regular)", text: "Suggesting" },
		],
		plugin.settings.toolbar_show_buttons_labels,
		"cmtr-suggestion-status",
		plugin.setEditMode.bind(plugin),
		(view) => view.editor.cm.state.facet(editModeValueState),
		plugin,
		render,
	);

export { HeaderButton };
