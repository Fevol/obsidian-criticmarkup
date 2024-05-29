import type {App, EventRef} from 'obsidian';
import {acceptSuggestions, isCursor, rangeParser, rejectSuggestions} from '../base';
import {addCommentToView} from "../renderers/gutters/comment-gutter";
import {COMMENTATOR_GLOBAL} from "../../global";

export const cmenuCommands: (app: App) => EventRef =
	(app) => app.workspace.on('editor-menu', (menu, editor) => {
		const ranges = editor.cm.state.field(rangeParser).ranges;
		menu.addItem((item) => {
			item.setTitle("Add comment")
				.setIcon('message-square')
				.setSection('criticmarkup')
				.onClick(() => {
					addCommentToView(editor.cm, ranges.at_cursor(editor.cm.state.selection.main.head));
				});
		});

		if (ranges.contains_range(editor.cm.state.selection.main.from, editor.cm.state.selection.main.to)) {
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
				const range = editor.cm.state.field(rangeParser).ranges.at_cursor(editor.cm.state.selection.ranges[0].head)!;

				menu.addItem((item) => {
					const submenu = item.setTitle('Set metadata')
						.setIcon('tags')
						.setSection('criticmarkup')
						.setSubmenu();

					submenu.addItem((item) => {
						item.setTitle('Set author')
							.setIcon('lucide-user')
							.onClick(() => {
								editor.cm.dispatch(editor.cm.state.update({
									changes: range.add_metadata('author', COMMENTATOR_GLOBAL.PLUGIN_SETTINGS.author)
								}));
							});
					});
					submenu.addItem((item) => {
						item.setTitle('Set time')
							.setIcon('lucide-calendar')
							.onClick(() => {
								editor.cm.dispatch(editor.cm.state.update({
									changes: range.add_metadata('time', Math.round(Date.now() / 1000))
								}));
							});
					});
					submenu.addItem((item) => {
						item.setTitle('Set completed')
							.setIcon('lucide-check')
							.onClick(() => {
								editor.cm.dispatch(editor.cm.state.update({
									changes: range.add_metadata('done', true)
								}));
							});
					});
				});
			}
		}
	});
