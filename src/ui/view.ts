import { ItemView, type ViewStateResult, WorkspaceLeaf } from 'obsidian';

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
	}

	async onClose(): Promise<void> {
		this.view!.$destroy();
		this.containerEl.detach();
	}

	getViewType(): string {
		return CRITICMARKUP_VIEW;
	}

	getDisplayText(): string {
		return 'Vault Comments';
	}

	getIcon(): string {
		return "message-square";
	}

	getState(): any {
		const state = super.getState();

		if (this.view) {
			state.filter_node_type = this.view.$$.ctx[<number>this.view.$$.props.filter_node_type];
			state.filter_location = this.view.$$.ctx[<number>this.view.$$.props.filter_location];
		}

		return state;
	}

	async setState(state: any, result: ViewStateResult): Promise<void> {
		if (!this.view) {
			this.view = new ViewPage({
				target: this.containerEl,
				props: {
					plugin: this.plugin,
				}
			});
		}

		this.view.$set({
			filter_node_type: state.filter_node_type || 0,
			filter_location: state.filter_location || 0,
		})

		await super.setState(state, result);
	}


	receiveUpdate() {
		this.view!.updateNodes();
	}
}
