import { HeaderButton } from './header-button';
import type CommentatorPlugin from '../../main';
import {editMode, editModeValue, editModeValueState, previewMode, previewModeState} from "../settings";
import {getEditMode} from "../uix/extensions/editing-modes";

export const previewModeHeaderButton = (plugin: CommentatorPlugin, render: boolean) => new HeaderButton(
	[
		{ icon: 'message-square', tooltip: 'Current mode: show all suggestions\nClick to preview \'accept all\'', text: 'Showing all suggestions' },
		{ icon: 'check', tooltip: 'Current mode: preview \'accept all\'\nClick to preview \'reject all\'', text: 'Previewing "accept all"' },
		{ icon: 'cross', tooltip: 'Current mode: preview \'reject all\'\nClick to preview \'show all\'', text: 'Previewing "reject all"' },
	],
	plugin.settings.toolbar_show_buttons_labels,
	'criticmarkup-suggestion-status',
	(view, value) => {
		view.editor.cm.dispatch(view.editor.cm.state.update({
			effects: previewMode.reconfigure(previewModeState.of(value))
		}));
	},
	(view) => {
		return view.editor.cm.state.facet(previewModeState);
	},
	plugin,
	render
);

export const suggestionModeHeaderButton = (plugin: CommentatorPlugin, render: boolean) => new HeaderButton(
	[
		{ icon: 'pencil', tooltip: 'Current mode: editing (regular)\nClick to edit (corrected)', text: 'Editing (REG)' },
		{ icon: 'edit', tooltip: 'Current mode: editing (corrected)\nClick to suggest', text: 'Editing (ALT)' },
		{ icon: 'file-edit', tooltip: 'Current mode: suggesting\nClick to edit (regular)', text: 'Suggesting' },
	],
	plugin.settings.toolbar_show_buttons_labels,
	'criticmarkup-suggestion-status',
	(view, value) => {
		view.editor.cm.dispatch(view.editor.cm.state.update({
			effects: [
				editMode.reconfigure(getEditMode(value, plugin.settings)),
				editModeValue.reconfigure(editModeValueState.of(value))
			]
		}));
	},
	(view) => {
		return view.editor.cm.state.facet(editModeValueState);
	},
	plugin,
	render
);

export { HeaderButton }
