import { Menu, setIcon } from "obsidian";
import type CommentatorPlugin from "../../main";
import { stickyContextMenuPatch } from "../../patches";

export class MetadataStatusBarButton {
	button: HTMLElement | null = null;
	index: number = 0;

	metadata_settings_toggles = [
		{ icon: "lucide-user", text: "Author", attribute: "author" },
		{ icon: "lucide-calendar", text: "Time", attribute: "timestamp" },
		{ icon: "lucide-check", text: "Completed", attribute: "completed" },
		{ icon: "brush", text: "Style", attribute: "style" },
		{ icon: "paintbrush", text: "Color", attribute: "color" },
	];

	constructor(private plugin: CommentatorPlugin, render = false) {
		this.setRendering(render);
	}

	showMenu(e: MouseEvent) {
		// NOTE: This disables the menu closing after clicking on a single menu item, allowing you to toggle multiple items at once
		// 			The menu can still be exited by clicking outside of it or pressing escape
		stickyContextMenuPatch();

		const menu = new Menu();

		menu.addItem((item) => {
			item.setTitle("Add metadata");
			item.setIcon("tags");
			item.setChecked(this.plugin.settings.add_metadata);
			item.onClick(async () => {
				await this.plugin.setSetting("add_metadata", !this.plugin.settings.add_metadata);
				item.setChecked(this.plugin.settings.add_metadata);
				menu.items.slice(1).forEach((item) => {
					item.setDisabled(!this.plugin.settings.add_metadata);
				});
			});
		});

		for (const { icon, text, attribute } of this.metadata_settings_toggles) {
			const setting = `add_${attribute}_metadata` as keyof typeof this.plugin.settings;
			menu.addItem((item) => {
				item.setTitle(text);
				item.setIcon(icon);
				item.setChecked(this.plugin.settings[setting] as boolean);
				item.setDisabled(!this.plugin.settings.add_metadata);
				item.onClick(async () => {
					await this.plugin.setSetting(setting, !this.plugin.settings[setting]);
					// FIXME: After calling .setChecked(false) once, the icon will not show up again when calling .setChecked(true)
					// 		the code below bypasses this issue by just hiding it via display style
					if (item.checkIconEl)
						item.checkIconEl.style.display = this.plugin.settings[setting] ? "flex" : "none";
					else
						item.setChecked(this.plugin.settings[setting] as boolean);
				});
				item.dom.addClass("cmtr-submenu-nested");
			});
		}
		menu.showAtMouseEvent(e);
	}

	setRendering(render?: boolean) {
		if (render === undefined || render === !!this.button) return;

		render ? this.renderButton() : this.detachButton();
	}

	renderButton() {
		this.button = this.plugin.addStatusBarItem();
		const span = this.button.createSpan({ cls: "status-bar-item-icon" });

		setIcon(span, "tags");
		this.button.classList.add("mod-clickable");
		this.button.setAttribute("aria-label", "Metadata");
		this.button.setAttribute("data-tooltip-position", "top");
		this.button.addEventListener("click", (e) => this.showMenu(e));
		this.button.addEventListener("contextmenu", (e) => this.showMenu(e));
	}

	detachButton() {
		if (!this.button) return;

		this.button.detach();
		this.button = null;
	}
}
