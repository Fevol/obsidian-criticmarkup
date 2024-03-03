import { StatusBarButton } from './status-bar-button';
import { MetadataStatusBarButton } from "./metadata-status-bar-button";
import type CommentatorPlugin from '../../main';

export const previewModeStatusBarButton = (plugin: CommentatorPlugin, render: boolean) => new StatusBarButton(
	'default_preview_mode',
	[
		{ icon: 'message-square', text: 'Showing all suggestions' },
		{ icon: 'check', text: 'Previewing "accept all"' },
		{ icon: 'cross', text: 'Previewing "reject all"' },
	],
	plugin,
	render
);

export const suggestionModeStatusBarButton = (plugin: CommentatorPlugin, render: boolean) => new StatusBarButton(
	'default_edit_mode',
	[
		{ icon: 'edit', text: 'Editing' },
		{ icon: 'file-edit', text: 'Suggesting' },
	],
	plugin,
	render
);


export const metadataStatusBarButton = (plugin: CommentatorPlugin, render: boolean) => new MetadataStatusBarButton(plugin, render);

export { StatusBarButton, MetadataStatusBarButton }
