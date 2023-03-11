import type { EventRef } from 'obsidian';

import { selectionToRange } from './editor-util';
import { acceptAllSuggestions, rejectAllSuggestions } from './commands';


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
						changes: acceptAllSuggestions(editor.cm.state, from, to),
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
						changes: rejectAllSuggestions(editor.cm.state, from, to),
					}));
				});
		});
	});