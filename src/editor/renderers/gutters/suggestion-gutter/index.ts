import { suggestionGutterMarkers } from './marker';

import { suggestion_gutter } from './suggestion-gutter';
import { Menu } from 'obsidian';
import { acceptSuggestions, rejectSuggestions } from '../../../base';

export const suggestionGutter = /*(plugin: CommentatorPlugin) => */[
	suggestionGutterMarkers,
	suggestion_gutter({
		class: 'criticmarkup-gutter' /* + (plugin.app.vault.getConfig('cssTheme') === 'Minimal' ? ' is-minimal' : '')*/,
		markers: v => v.plugin(suggestionGutterMarkers)!.markers,
		domEventHandlers: {
			click: (view, line, event: Event) => {
				const menu = new Menu();
				menu.addItem(item => {
					item.setTitle('Accept changes')
						.setIcon('check')
						.onClick(() => {
							view.dispatch({ changes: acceptSuggestions(view.state, line.from, line.to) });
						});
				});
				menu.addItem(item => {
					item.setTitle('Reject changes')
						.setIcon('cross')
						.onClick(() => {
							view.dispatch({ changes: rejectSuggestions(view.state, line.from, line.to) });
						});
				});

				menu.showAtMouseEvent(<MouseEvent>event);
				return false;
			},
		},
	})
];

export { suggestionGutterMarkers }
