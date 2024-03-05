import { Modal } from "obsidian";
import type {SvelteComponent} from "svelte"

import DateRangeModalView from "./DateRangeModal.svelte";
import CommentatorPlugin from "../../main";

export class DaterangeModal extends Modal {
    private view: SvelteComponent | undefined;

    constructor(private plugin: CommentatorPlugin, private value: number[] | undefined, private callback: (string: []) => void) {
        super(plugin.app);
        this.contentEl.parentElement!.addClass("criticmarkup-daterange-picker-modal")
    }

    async onOpen() {
        this.view = new DateRangeModalView({
            target: this.contentEl,
            props: {
                value: this.value?.map((v) => {
                    return new Date(v * 1000).toISOString().split("T")[0];
                })
            }
        });

        this.view.$on("close", async (e) => {
            this.callback(e.detail?.length ? e.detail : undefined);
            super.close();
        });

    }

    onClose() {
        this.view?.$destroy();
    }
}
