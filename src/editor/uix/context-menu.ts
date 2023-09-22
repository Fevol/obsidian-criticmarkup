import type { EventRef } from 'obsidian';
import {
	acceptSuggestions, rejectSuggestions,
	selectionContainsNodes,
} from '../base';

export const cmenuCommands: EventRef =
	app.workspace.on('editor-menu', (menu, editor) => {
		if (selectionContainsNodes(editor.cm.state)) {
			menu.addItem((item) => {
				item.setTitle('Accept changes')
					.setIcon('check')
					.setSection('criticmarkup')
					.onClick(() => {
						const selections = editor.cm.state.selection.ranges;
						const changes = selections.map(selection => acceptSuggestions(editor.cm.state, selection.from, selection.to));
						editor.cm.dispatch(editor.cm.state.update({
							changes,
						}));
					});
			});

			menu.addItem((item) => {
				item.setTitle('Reject changes')
					.setIcon('cross')
					.setSection('criticmarkup')
					.onClick(() => {
						const selections = editor.cm.state.selection.ranges;
						const changes = selections.map(selection => rejectSuggestions(editor.cm.state, selection.from, selection.to));
						editor.cm.dispatch(editor.cm.state.update({
							changes,
						}));
					});
			});
		}
	});
