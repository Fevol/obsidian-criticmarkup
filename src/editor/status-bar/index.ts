import { StatusBarButton } from './status-bar-button';
import { MetadataStatusBarButton } from "./metadata-status-bar-button";
import type CommentatorPlugin from '../../main';
import {editModeValueState, previewModeState} from "../settings";

export const previewModeStatusBarButton = (plugin: CommentatorPlugin, render: boolean) => new StatusBarButton(
	[
		{ icon: 'message-square', text: 'Showing all suggestions' },
		{ icon: 'check', text: 'Previewing "accept all"' },
		{ icon: 'cross', text: 'Previewing "reject all"' },
	],
	plugin.setPreviewMode.bind(plugin),
	(editor) => {
		return editor.cm.state.facet(previewModeState);
	},
	plugin,
	render
);

export const suggestionModeStatusBarButton = (plugin: CommentatorPlugin, render: boolean) => new StatusBarButton(
	[
		{ icon: 'pencil', text: 'Editing (Regular)' },
		{ icon: 'edit', text: 'Editing (Corrected)' },
		{ icon: 'file-edit', text: 'Suggesting' },
	],
	plugin.setEditMode.bind(plugin),
	(editor) => {
		return editor.cm.state.facet(editModeValueState);
	},
	plugin,
	render
);


export const metadataStatusBarButton = (plugin: CommentatorPlugin, render: boolean) => new MetadataStatusBarButton(plugin, render);

export { StatusBarButton, MetadataStatusBarButton }
