import { HeaderButton } from './header-button';
import type CommentatorPlugin from '../../main';

export const previewModeButton = (plugin: CommentatorPlugin) => new HeaderButton(
	"preview_mode",
	[
		{ icon: 'message-square', tooltip: 'Show all suggestions', text: 'Showing suggestions' },
		{ icon: 'check', tooltip: 'Preview "accept all"', text: 'Previewing "accept all"' },
		{ icon: 'cross', tooltip: 'Preview "reject all"', text: 'Previewing "reject all"' },
	],
	true,
	'criticmarkup-suggestion-status',
	plugin
);

export const suggestionModeButton = (plugin: CommentatorPlugin) => new HeaderButton(
	"suggest_mode",
	[
		{ icon: 'file-edit', tooltip: 'Directly edit document',  text: 'Editing' },
		{ icon: 'edit', tooltip: 'Mark edits as suggestions', text: 'Suggesting',  },
	],
	true,
	'criticmarkup-suggestion-status',
	plugin
);

export { HeaderButton }
