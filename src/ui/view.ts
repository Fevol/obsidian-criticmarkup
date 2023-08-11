import { ItemView, WorkspaceLeaf } from 'obsidian';

import type {SvelteComponent} from "svelte";
import ViewPage from "./pages/ViewPage.svelte";

import CommentatorPlugin from '../main';

export const CRITICMARKUP_VIEW = "criticmarkup-view";



export class CriticMarkupView extends ItemView {
	view: SvelteComponent | null = null;

	constructor(leaf: WorkspaceLeaf, public plugin: CommentatorPlugin) {
		super(leaf);
	}

	async onOpen(): Promise<void> {
		this.containerEl.empty();
		this.containerEl.classList.add("criticmarkup-view");

		this.view = new ViewPage({
			target: this.containerEl,
			props: {
				plugin: this.plugin,
			}
		});
	}

	async onClose(): Promise<void> {
		this.view!.$destroy();
		this.containerEl.detach();
	}

	getViewType(): string {
		return CRITICMARKUP_VIEW;
	}

	getDisplayText(): string {
		return 'Criticmarkup View';
	}
}
