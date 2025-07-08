import { ItemView, type ViewStateResult, WorkspaceLeaf } from "obsidian";

import { mount, unmount } from "svelte";
import { AnnotationsViewPage } from "./pages/annotations-view";
import type CommentatorPlugin from "../main";

export const COMMENTATOR_ANNOTATIONS_VIEW = "commentator-annotations-view";

interface CommentatorAnnotationsViewState {
	range_type_filter: number;
	location_filter: number;
	content_filter: number;
	author_filter: number;
	date_filter: number[];
}

export class CommentatorAnnotationsView extends ItemView {
	view: ReturnType<typeof AnnotationsViewPage> | null = null;
	props: Partial<CommentatorAnnotationsViewState> & { plugin: CommentatorPlugin } = $state({
		plugin: undefined!,
		range_type_filter: undefined,
		location_filter: undefined,
		content_filter: undefined,
		author_filter: undefined,
		date_filter: undefined,
	});

	constructor(leaf: WorkspaceLeaf, public plugin: CommentatorPlugin) {
		super(leaf);
		this.props.plugin = plugin;
	}

	async onOpen(): Promise<void> {
		this.containerEl.empty();
		this.containerEl.classList.add("cmtr-view");
	}

	async onClose(): Promise<void> {
		if (this.view) {
			await unmount(this.view);
		}
		this.containerEl.detach();
	}

	getViewType(): string {
		return COMMENTATOR_ANNOTATIONS_VIEW;
	}

	getDisplayText(): string {
		return "Vault suggestions and comments";
	}

	getIcon(): string {
		return "message-square";
	}

	getState() {
		const { plugin, ...props } = this.props;
		return {
			...super.getState(),
			...props,
		}
	}

	async setState(state: Partial<CommentatorAnnotationsViewState>, result: ViewStateResult): Promise<void> {
		if (!this.view) {
			this.props.plugin = this.plugin;
			this.view = mount(AnnotationsViewPage, {
				target: this.containerEl,
				props: this.props,
			});
		}

		this.props.range_type_filter = state.range_type_filter || 0;
		this.props.location_filter = state.location_filter || 0;
		this.props.content_filter = state.content_filter || 0;
		this.props.author_filter = state.author_filter || 0;
		this.props.date_filter = state.date_filter || undefined;

		await super.setState(state, result);
	}
}
