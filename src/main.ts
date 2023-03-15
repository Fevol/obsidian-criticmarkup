import { EventRef, MarkdownPostProcessor, MarkdownPreviewRenderer, MarkdownView, Platform, Plugin } from 'obsidian';

import type { Extension } from '@codemirror/state';

import { commands } from './editor/commands';
import { change_suggestions } from './editor/context-menu-commands';

import { treeParser } from './editor/tree-parser';

import { livePreview } from './editor/live-preview';
import { postProcess, postProcessorUpdate } from './editor/post-processor';

import { keybindExtensions } from './editor/keybind-extensions';
import { suggestionMode } from './editor/suggestion-mode';
import { nodeCorrecter, bracketMatcher } from './editor/editor-handlers';

import { gutterExtension } from './editor/criticmarkup-gutter';

import { loadPreviewButtons, removePreviewButtons } from './editor/editor-preview-buttons';
import { loadSuggestButtons, removeSuggestButtons, updateSuggestButtons } from './editor/editor-suggestion-buttons';


import { CommentatorSettings } from './ui/settings';

import { objectDifference } from './util';

import { DEFAULT_SETTINGS } from './constants';
import type { PluginSettings } from './types';


export default class CommentatorPlugin extends Plugin {
	private editorExtensions: Extension[] = [];

	settings: PluginSettings = DEFAULT_SETTINGS;
	previous_settings: Partial<PluginSettings> = {};

	changed_settings: Partial<PluginSettings> = {};

	loadPreviewButtonsEvent!: EventRef;
	loadSuggestButtonsEvent!: EventRef;

	postProcessor!: MarkdownPostProcessor;

	loadEditorExtensions() {
		this.editorExtensions.length = 0;

		this.editorExtensions.push(keybindExtensions);
		this.editorExtensions.push(treeParser);

		if (this.settings.live_preview)
			this.editorExtensions.push(livePreview(this.settings));

		if (this.settings.editor_gutter)
			this.editorExtensions.push(gutterExtension(this.settings));

		if (this.settings.suggest_mode)
			this.editorExtensions.push(suggestionMode);

		if (this.settings.tag_completion)
			this.editorExtensions.push(bracketMatcher);
		if (this.settings.node_correcter)
			this.editorExtensions.push(nodeCorrecter);
	}

	async updateEditorExtension() {
		if (Object.keys(this.changed_settings).some(key =>
			['suggestion_status', 'editor_styling', 'live_preview', 'editor_gutter', 'tag_completion', 'node_correcter', 'suggest_mode', 'hide_empty_gutter'].includes(key))) {
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
			loadPreviewButtons(this);
			this.loadPreviewButtonsEvent = app.workspace.on('layout-change', () => loadPreviewButtons(this));
			this.registerEvent(this.loadPreviewButtonsEvent);
		}

		if (this.settings.editor_suggest_button) {
			loadSuggestButtons(this);
			this.loadSuggestButtonsEvent = app.workspace.on('layout-change', () => loadSuggestButtons(this));
			this.registerEvent(this.loadSuggestButtonsEvent);
		}


		this.addSettingTab(new CommentatorSettings(this.app, this));
		this.loadEditorExtensions();
		this.registerEditorExtension(this.editorExtensions);

		if (this.settings.post_processor) {
			this.postProcessor = this.registerMarkdownPostProcessor((el, ctx) => postProcess(el, ctx, this.settings), -99999);
			postProcessorUpdate();
		}

		this.registerEvent(change_suggestions);
		// this.registerEvent(file_view_modes);

		commands.push({
			id: 'commentator-suggest-mode',
			name: 'Toggle suggestion mode',
			icon: 'comment',
			plugin_context: true,
			callback: async () => {
				this.settings.suggest_mode = !this.settings.suggest_mode;
				await this.saveSettings();
			}
		})

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
			removePreviewButtons();
		if (this.settings.editor_suggest_button)
			removeSuggestButtons();

		MarkdownPreviewRenderer.unregisterPostProcessor(this.postProcessor);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);

		this.changed_settings = objectDifference(this.settings, this.previous_settings);
		this.previous_settings = Object.assign({}, this.settings);

		if (this.changed_settings.suggest_mode !== undefined) {
			updateSuggestButtons(this);
		}

		if (this.changed_settings.editor_preview_button !== undefined) {
			if (this.changed_settings.editor_preview_button) {
				loadPreviewButtons(this);
				this.loadPreviewButtonsEvent = app.workspace.on('layout-change', () => loadPreviewButtons(this));
				this.registerEvent(this.loadPreviewButtonsEvent);
			} else {
				removePreviewButtons();
				app.workspace.offref(this.loadPreviewButtonsEvent);
				this.settings.suggestion_status = 0;
			}
		}

		if (this.changed_settings.editor_suggest_button !== undefined) {
			if (this.changed_settings.editor_suggest_button) {
				loadSuggestButtons(this);
				this.loadSuggestButtonsEvent = app.workspace.on('layout-change', () => loadSuggestButtons(this));
				this.registerEvent(this.loadSuggestButtonsEvent);
			} else {
				removeSuggestButtons();
				app.workspace.offref(this.loadSuggestButtonsEvent);
			}
		}

		if (this.changed_settings.post_processor !== undefined) {
			if (this.changed_settings.post_processor)
				this.postProcessor = this.registerMarkdownPostProcessor((el, ctx) => postProcess(el, ctx, this.settings), -99999);
			else
				MarkdownPreviewRenderer.unregisterPostProcessor(this.postProcessor);
		}


		this.updateEditorExtension();
	}
}


