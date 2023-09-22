import { gutter } from '@codemirror/view';

import { Menu } from 'obsidian';

import { criticmarkupGutterMarkers } from './marker';

import { acceptSuggestions, rejectSuggestions } from '../../../base';
import CommentatorPlugin from '../../../../main';


export const criticmarkupGutter = (plugin: CommentatorPlugin) => [
	criticmarkupGutterMarkers,
	gutter({
		class: 'criticmarkup-gutter' + (!plugin.settings.hide_empty_gutter ? ' criticmarkup-gutter-show-empty' : '') +
			(plugin.app.vault.getConfig('cssTheme') === 'Minimal' ? ' is-minimal' : ''),
		markers: v => v.plugin(criticmarkupGutterMarkers)!.markers,
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
