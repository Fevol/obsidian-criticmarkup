import {
	Plugin,
	Platform,
	MarkdownView,
	EventRef,
	MarkdownPostProcessor,
	MarkdownPreviewRenderer
} from 'obsidian';
import { inlinePlugin } from './editor/live-preview';
import {postProcess, postProcessorUpdate} from './editor/post-processor';

import {commands} from './editor/commands';
import { change_suggestions } from './editor/context-menu-commands';
import type { Extension } from '@codemirror/state';
import { bracketMatcher, nodeCorrecter } from './editor/editor-handlers';
import type {PluginSettings} from "./types";
import {DEFAULT_SETTINGS} from "./constants";
import {loadEditorButtons, removeEditorButtons} from "./editor/editor-preview-buttons";
import {objectDifference} from "./editor/util";
import {CommentatorSettings} from "./ui/settings";

export default class CommentatorPlugin extends Plugin {
	private editorExtensions: Extension[] = [];

	settings: PluginSettings = DEFAULT_SETTINGS;
	previous_settings: Partial<PluginSettings> = {};

	changed_settings: Partial<PluginSettings> = {};

	loadButtonsEvent!: EventRef;
	postProcessor!: MarkdownPostProcessor;

	button_mapping = new WeakMap<MarkdownView, {
		button: HTMLElement,
		status: HTMLElement,
	}>();


	loadEditorExtensions() {
		this.editorExtensions.length = 0;
		if (this.settings.live_preview || this.settings.editor_gutter)
			this.editorExtensions.push(inlinePlugin(this.settings));

		if (this.settings.tag_completion)
			this.editorExtensions.push(bracketMatcher);
		if (this.settings.node_correcter)
			this.editorExtensions.push(nodeCorrecter);
	}

	async updateEditorExtension() {
		if (Object.keys(this.changed_settings).some(key =>
			["suggestion_status", "editor_styling", "live_preview", "editor_gutter", "tag_completion", "node_correcter"].includes(key))) {
			this.loadEditorExtensions();
			this.app.workspace.updateOptions();
		}

		if (this.settings.post_processor)
			postProcessorUpdate();

	}


	async onload() {
		this.settings = Object.assign({}, this.settings, await this.loadData());
		this.previous_settings = Object.assign({}, this.settings);

		if (this.settings.editor_preview_button) {
			loadEditorButtons(this);
			this.loadButtonsEvent = app.workspace.on("layout-change", () => loadEditorButtons(this));
			this.registerEvent(this.loadButtonsEvent);
		}

		this.addSettingTab(new CommentatorSettings(this.app, this));
		this.loadEditorExtensions();
		this.registerEditorExtension(this.editorExtensions);

		if (this.settings.post_processor) {
			this.postProcessor = this.registerMarkdownPostProcessor((el, ctx) => postProcess(el, ctx, this.settings));
			postProcessorUpdate();
		}

		this.registerEvent(change_suggestions);
		// this.registerEvent(file_view_modes);

		for (const command of commands) {
			if (Platform.isMobile || command.editor_context) {
				command.editorCallback = command.callback;
				delete command.callback;
			}

			this.addCommand(command);
		}
	}

	async onunload() {
		if (this.settings.editor_preview_button)
			removeEditorButtons(this);
		MarkdownPreviewRenderer.unregisterPostProcessor(this.postProcessor);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);

		this.changed_settings = objectDifference(this.settings, this.previous_settings);
		this.previous_settings = Object.assign({}, this.settings);

		if (this.changed_settings.editor_preview_button !== undefined) {
			if (this.changed_settings.editor_preview_button) {
				loadEditorButtons(this);
				this.loadButtonsEvent = app.workspace.on("layout-change", () => loadEditorButtons(this));
				this.registerEvent(this.loadButtonsEvent);
			} else {
				removeEditorButtons(this);
				app.workspace.offref(this.loadButtonsEvent);
				this.settings.suggestion_status = 0;
			}
		}

		if (this.changed_settings.post_processor !== undefined) {
			if (this.changed_settings.post_processor)
				this.postProcessor = this.registerMarkdownPostProcessor((el, ctx) => postProcess(el, ctx, this.settings));
			else
				MarkdownPreviewRenderer.unregisterPostProcessor(this.postProcessor);
			postProcessorUpdate();
		}


		this.updateEditorExtension();
	}
}


