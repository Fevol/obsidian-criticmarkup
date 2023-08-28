import type { EventRef } from 'obsidian';
import { acceptAllSuggestions, rejectAllSuggestions } from './commands';


export const change_suggestions: EventRef =
	app.workspace.on('editor-menu', (menu, editor) => {
		menu.addItem((item) => {
			item.setTitle('Accept changes')
				.setIcon('check')
				.setSection('criticmarkup')
				.onClick(() => {
					const selections = editor.cm.state.selection.ranges;
					const changes = selections.map(selection => acceptAllSuggestions(editor.cm.state, selection.from, selection.to));
					editor.cm.dispatch(editor.cm.state.update({ changes }));
				});
		});

		menu.addItem((item) => {
			item.setTitle('Reject changes')
				.setIcon('cross')
				.setSection('criticmarkup')
				.onClick(() => {
					const selections = editor.cm.state.selection.ranges;
					const changes = selections.map(selection => rejectAllSuggestions(editor.cm.state, selection.from, selection.to));
					editor.cm.dispatch(editor.cm.state.update({ changes }));
				});
		});
	});
