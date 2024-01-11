import type { EventRef } from 'obsidian';
import { acceptSuggestions, isCursor, nodeParser, rejectSuggestions, selectionContainsNodes } from '../base';
import { commentGutter } from '../renderers/gutters';

export const cmenuCommands: EventRef =
	app.workspace.on('editor-menu', (menu, editor) => {
		menu.addItem((item) => {
			item.setTitle("Add comment")
				.setIcon('message-square')
				.setSection('criticmarkup')
				.onClick(() => {
					// TODO: Replace by dedicated function for checking if selection etc
					const cursor = editor.cm.state.selection.main.from;
					editor.cm.dispatch(editor.cm.state.update({
						changes: {
							from: cursor,
							to: cursor,
							insert: "{>><<}"
						},
					}));
					setTimeout(() => {
						// @ts-expect-error (Directly accessing function of unexported class)
						editor.cm.plugin(commentGutter[1][0][0])!.focusCommentThread(cursor + 1);
					});
				});
		});

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

			if (isCursor(editor.cm.state.selection)) {
				const node = editor.cm.state.field(nodeParser).nodes.at_cursor(editor.cm.state.selection.ranges[0].head)!;

				menu.addItem((item) => {
					const submenu = item.setTitle('Set metadata')
						.setIcon('lucide-text')
						.setSection('criticmarkup')
						.setSubmenu();

					submenu.addItem((item) => {
						item.setTitle('Set author')
							.setIcon('lucide-user')
							.onClick(() => {
								editor.cm.dispatch(editor.cm.state.update({
									changes: node.add_metadata('author', 'ITS A ME!')
								}));
							});
					});
					submenu.addItem((item) => {
						item.setTitle('Set time')
							.setIcon('lucide-calendar')
							.onClick(() => {
								editor.cm.dispatch(editor.cm.state.update({
									changes: node.add_metadata('time', Date.now() / 1000)
								}));
							});
					});
					submenu.addItem((item) => {
						item.setTitle('Set completed')
							.setIcon('lucide-check')
							.onClick(() => {
								editor.cm.dispatch(editor.cm.state.update({
									changes: node.add_metadata('done', true)
								}));
							});
					});
				});
			}
		}
	});
