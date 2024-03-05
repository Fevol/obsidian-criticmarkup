import {ItemView, type Plugin, type ViewStateResult, WorkspaceLeaf} from 'obsidian';

import type {SvelteComponent} from "svelte";
import { ViewPage } from "./pages/view";

export const CRITICMARKUP_VIEW = "criticmarkup-view";


export class CriticMarkupView extends ItemView {
	view: SvelteComponent | null = null;

	constructor(leaf: WorkspaceLeaf, public plugin: Plugin) {
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
		return 'Vault suggestions and comments';
	}

	getIcon(): string {
		return "message-square";
	}

	getState(): any {
		const state = super.getState();

		if (this.view) {
			state.range_type_filter = this.view.$$.ctx[<number>this.view.$$.props.range_type_filter];
			state.location_filter = this.view.$$.ctx[<number>this.view.$$.props.location_filter];
			state.content_filter = this.view.$$.ctx[<string>this.view.$$.props.content_filter];
			state.author_filter = this.view.$$.ctx[<string>this.view.$$.props.author_filter];
			state.date_filter = this.view.$$.ctx[<string>this.view.$$.props.date_filter];
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
			range_type_filter: state.range_type_filter || 0,
			location_filter: state.location_filter || 0,
			content_filter: state.content_filter || 0,
			author_filter: state.author_filter || 0,
			date_filter: state.date_filter || undefined,
		})

		await super.setState(state, result);
	}
}
