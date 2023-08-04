import { EventRef, MarkdownPostProcessor, MarkdownPreviewRenderer, Platform, Plugin } from 'obsidian';

import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

import { commands } from './editor/commands';
import { change_suggestions } from './editor/context-menu-commands';

import { treeParser } from './editor/tree-parser';
import { nodesInSelection } from './editor/editor-util';

import { inlineCommentRenderer, livePreview, livePreviewRenderer } from './editor/renderers/live-preview';
import { postProcess, postProcessorRerender, postProcessorUpdate } from './editor/renderers/post-processor';

import { keybindExtensions } from './editor/suggestion-mode/keybinds';
import { suggestionMode } from './editor/suggestion-mode/suggestion-mode';
import { nodeCorrecter, bracketMatcher } from './editor/editor-handlers';

import { gutterExtension } from './editor/renderers/criticmarkup-gutter';
import { commentGutterExtension } from './editor/renderers/comment-gutter';

import { loadPreviewButtons, removePreviewButtons } from './editor/renderers/editor-preview-buttons';
import { loadSuggestButtons, removeSuggestButtons, updateSuggestButtons } from './editor/renderers/editor-suggestion-buttons';


import {around} from 'monkey-around';

import { CommentatorSettings } from './ui/settings';

import { objectDifference } from './util';

import { DEFAULT_SETTINGS, REQUIRES_FULL_RELOAD } from './constants';
import type { PluginSettings } from './types';
import { Tree } from '@lezer/common';



export default class CommentatorPlugin extends Plugin {
	private editorExtensions: Extension[] = [];

	settings: PluginSettings = DEFAULT_SETTINGS;
	previous_settings: Partial<PluginSettings> = {};

	changed_settings: Partial<PluginSettings> = {};

	loadPreviewButtonsEvent!: EventRef;
	loadSuggestButtonsEvent!: EventRef;

	remove_monkeys: any[] = [];

	postProcessor!: MarkdownPostProcessor;

	loadEditorExtensions() {
		this.editorExtensions.length = 0;

		this.editorExtensions.push(keybindExtensions);
		this.editorExtensions.push(treeParser);

		if (this.settings.comment_style === "icon" || this.settings.comment_style === "block")
			this.editorExtensions.push(inlineCommentRenderer(this.settings));
		if (this.settings.comment_style === "block")
			this.editorExtensions.push(commentGutterExtension/*(this.settings)*/);

		if (this.settings.live_preview) {
			if (this.settings.alternative_live_preview)
				this.editorExtensions.push(livePreviewRenderer(this.settings));
			else
				this.editorExtensions.push(livePreview(this.settings));
		}

		// Performance: ~3ms in stress-test
		if (this.settings.editor_gutter)
			this.editorExtensions.push(gutterExtension(this.settings));

		// Performance: ~1ms in stress-test
		if (this.settings.suggest_mode)
			this.editorExtensions.push(suggestionMode(this.settings));

		if (this.settings.tag_completion)
			this.editorExtensions.push(bracketMatcher);
		if (this.settings.node_correcter)
			this.editorExtensions.push(nodeCorrecter);

		this.editorExtensions.push(EditorView.domEventHandlers({
			copy: (event, view) => {
				if (event.clipboardData && this.settings.clipboard_remove_syntax) {
					const selection = view.state.selection.main;
					const tree: Tree = view.state.field(treeParser).tree;
					const nodes = nodesInSelection(tree, selection.from, selection.to);

					const removed_syntax = nodes.unwrap_in_range(view.state.doc, selection.from, selection.to).output;
					event.clipboardData.setData('text/plain', removed_syntax);
					event.preventDefault();
				}
			},
		}));

	}

	async updateEditorExtension() {
		if (Object.keys(this.changed_settings).some(key => REQUIRES_FULL_RELOAD.has(key))) {
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
			},
		});

		commands.push({
			id: 'commentator-toggle-vim',
			name: '(DEBUG) Toggle Vim mode',
			icon: 'comment',
			callback: async () => {
				this.app.vault.setConfig('vimMode', !this.app.vault.getConfig('vimMode'));
			},
		});

		for (const command of commands) {
			if (Platform.isMobile || command.editor_context) {
				command.editorCallback = command.callback;
				delete command.callback;
			}

			this.addCommand(command);
		}

		this.app.workspace.onLayoutReady(() => {
			// FIXME: Probably an unnecessary hack, but toggle-source mode does not have an event to hook into,
			//   so in order to also update the live preview of this plugin, we need to monkey around the toggle-source command.
			this.remove_monkeys.push(around(app.commands.editorCommands['editor:toggle-source'], {
				checkCallback: (oldMethod) => {
					return (...args: any) => {
						const result = oldMethod && oldMethod.apply(app.commands.editorCommands['editor:toggle-source'], args);
						if (result && !args[0])
							this.loadEditorExtensions();
						return result;
					};
				},
			}));
		});
	}

	async onunload() {
		if (this.settings.editor_preview_button)
			removePreviewButtons();
		if (this.settings.editor_suggest_button)
			removeSuggestButtons();

		MarkdownPreviewRenderer.unregisterPostProcessor(this.postProcessor);

		for (const monkey of this.remove_monkeys) {
			monkey();
		}
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
				this.settings.preview_mode = 0;
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
			postProcessorRerender();
		}

		this.updateEditorExtension();
	}
}


