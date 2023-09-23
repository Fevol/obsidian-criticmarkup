import { StatusBarButton } from './status-bar-button';
import type CommentatorPlugin from '../../main';

export const previewModeStatusBarButton = (plugin: CommentatorPlugin) => new StatusBarButton(
	'preview_mode',
	[
		{ icon: 'message-square', text: 'Showing all suggestions' },
		{ icon: 'check', text: 'Previewing "accept all"' },
		{ icon: 'cross', text: 'Previewing "reject all"' },
	],
	plugin
);

export const suggestionModeStatusBarButton = (plugin: CommentatorPlugin) => new StatusBarButton(
	'suggest_mode',
	[
		{ icon: 'edit', text: 'Editing' },
		{ icon: 'file-edit', text: 'Suggesting' },
	],
	plugin
);

export { StatusBarButton }
