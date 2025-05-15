import { Menu } from "obsidian";
import { Compartment } from "@codemirror/state";

import { acceptSuggestions, rejectSuggestions } from "../../../base";
import { diff_gutter } from "./diff-gutter";
import { diffGutterMarkers } from "./marker";

export const diffGutter = /*(plugin: CommentatorPlugin) => */ [
	diffGutterMarkers,
	diff_gutter({
		class: "criticmarkup-gutter", /* + (plugin.app.vault.getConfig('cssTheme') === 'Minimal' ? ' is-minimal' : '')*/
		markers: v => v.plugin(diffGutterMarkers)!.markers,
		domEventHandlers: {
			click: (view, line, event: Event) => {
				const menu = new Menu();
				menu.addItem(item => {
					item.setTitle("Accept changes")
						.setIcon("check")
						.onClick(() => {
							view.dispatch({ changes: acceptSuggestions(view.state, line.from, line.to) });
						});
				});
				menu.addItem(item => {
					item.setTitle("Reject changes")
						.setIcon("cross")
						.onClick(() => {
							view.dispatch({ changes: rejectSuggestions(view.state, line.from, line.to) });
						});
				});

				menu.showAtMouseEvent(<MouseEvent> event);
				return false;
			},
		},
	}),
];

export const diffGutterCompartment = new Compartment();


export { diffGutterMarkers };
