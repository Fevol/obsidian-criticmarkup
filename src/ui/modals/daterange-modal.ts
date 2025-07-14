import { Modal } from "obsidian";
import { mount, unmount } from "svelte";

import type CommentatorPlugin from "../../main";
import DateRangeModalView from "./DateRangeModal.svelte";

export class DaterangeModal extends Modal {
	private view: ReturnType<typeof DateRangeModalView> | undefined;

	constructor(
		private plugin: CommentatorPlugin,
		private value: number[] | undefined,
		private callback: (string: string | string[] | null) => void,
	) {
		super(plugin.app);
		this.contentEl.parentElement!.addClass("cmtr-daterange-picker-modal");
	}

	async onOpen() {
		this.view = mount(DateRangeModalView, {
			target: this.contentEl,
			props: {
				value: this.value?.map((v) => {
					return new Date(v * 1000).toISOString().split("T")[0];
				}),
				onClose: async (e: string | string[] | null) => {
					this.callback(e);
					super.close();
				}
			}
		});
	}

	onClose() {
		if (this.view) {
			unmount(this.view);
		}
	}
}
