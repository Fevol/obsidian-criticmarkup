import { HeaderButton } from './header-button';
import type CommentatorPlugin from '../../main';

export const previewModeHeaderButton = (plugin: CommentatorPlugin, render: boolean) => new HeaderButton(
	"preview_mode",
	[
		{ icon: 'check', tooltip: 'Current mode: show all suggestions\nClick to preview \'accept all\'', text: 'Showing all suggestions' },
		{ icon: 'cross', tooltip: 'Current mode: preview \'accept all\'\nClick to preview \'reject all\'', text: 'Previewing "accept all"' },
		{ icon: 'message-square', tooltip: 'Current mode: preview \'reject all\'\nClick to preview \'show all\'', text: 'Previewing "reject all"' },
	],
	plugin.settings.show_editor_buttons_labels,
	'criticmarkup-suggestion-status',
	plugin,
	render
);

export const suggestionModeHeaderButton = (plugin: CommentatorPlugin, render: boolean) => new HeaderButton(
	"suggest_mode",
	[
		{ icon: 'edit', tooltip: 'Current mode: editing\nClick to suggest', text: 'Editing' },
		{ icon: 'file-edit', tooltip: 'Current mode: suggesting\nClick to edit', text: 'Suggesting' },
	],
	plugin.settings.show_editor_buttons_labels,
	'criticmarkup-suggestion-status',
	plugin,
	render
);

export { HeaderButton }
