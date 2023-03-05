import type { EventRef } from 'obsidian';
import type { ItemView } from 'obsidian';
import { setIcon } from 'obsidian';

// Partially adapted from Commander plugin
let button_mapping = new WeakMap<ItemView, HTMLElement>();

const status_mapping = [
	{ icon: "message-square", label: "Preview \"accept all\"" },
	{ icon: "check", label: "Preview \"accept all\"" },
	{ icon: "cross", label: "Preview \"reject all\"" },
];

export const file_view_modes: EventRef =
	app.workspace.on("layout-change", () => {
		for (const leaf of app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view as ItemView;
			if (button_mapping.has(view)) continue;

			let status = 1;
			const buttonElement = view.addAction("message-square", "View all suggestions", () => {
				const { icon, label } = status_mapping[status];
				setIcon(buttonElement, icon);
				buttonElement.setAttribute("aria-label", label);
				status = (status + 1) % status_mapping.length;
			});
			button_mapping.set(view, buttonElement);
		}
	})