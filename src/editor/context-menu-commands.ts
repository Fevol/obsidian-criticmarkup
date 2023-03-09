import type { EventRef } from 'obsidian';
import { acceptAllSuggestions, rejectAllSuggestions } from './commands';
import { selectionToRange } from './editor-util';


export const change_suggestions: EventRef =
	app.workspace.on('editor-menu', (menu, editor) => {
		menu.addItem((item) => {
			item.setTitle('Accept changes')
				.setIcon('check')
				.setSection('criticmarkup')
				.onClick(() => {
					const [from, to] = selectionToRange(editor);
					// @ts-ignore (editor.cm.dispatch exists)
					editor.cm.dispatch(editor.cm.state.update({
						changes: acceptAllSuggestions(editor.getValue(), from, to),
					}));
				});
		});

		menu.addItem((item) => {
			item.setTitle('Reject changes')
				.setIcon('cross')
				.setSection('criticmarkup')
				.onClick(() => {
					const [from, to] = selectionToRange(editor);
					// @ts-ignore (editor.cm.dispatch exists)
					editor.cm.dispatch(editor.cm.state.update({
						changes: rejectAllSuggestions(editor.getValue(), from, to),
					}));
				});
		});
	});