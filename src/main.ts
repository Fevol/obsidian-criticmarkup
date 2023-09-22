import { type MarkdownPostProcessor, MarkdownPreviewRenderer, Platform, Plugin, TFile } from 'obsidian';

import { EditorView } from '@codemirror/view';
import { type Extension } from '@codemirror/state';

import { around } from 'monkey-around';

import {
	nodeParser, type CriticMarkupNode, NODE_PROTOTYPE_MAPPER,
	getNodesInText, text_copy
} from './editor/base';

import { commands, cmenuCommands } from './editor/uix';
import { nodeCorrecter, bracketMatcher, suggestionMode, keybindExtensions } from './editor/uix/extensions';

import { postProcess, postProcessorRerender, postProcessorUpdate } from './editor/renderers/post-process';
import { markupRenderer, commentRenderer } from './editor/renderers/live-preview';
import { criticmarkupGutter, commentGutter } from './editor/renderers/gutters';
import { type HeaderButton, previewModeButton, suggestionModeButton } from './editor/view-header';


import { CRITICMARKUP_VIEW, CriticMarkupView } from './ui/view';
import { CommentatorSettings } from './ui/settings';

import { Database } from './database';

import { objectDifference } from './util';
import { DEFAULT_SETTINGS, REQUIRES_FULL_RELOAD } from './constants';
import { type PluginSettings } from './types';


export default class CommentatorPlugin extends Plugin {
	private editorExtensions: Extension[] = [];

	settings: PluginSettings = DEFAULT_SETTINGS;
	previous_settings: Partial<PluginSettings> = {};
	changed_settings: Partial<PluginSettings> = {};

	previewModeButton!: HeaderButton;
	suggestionModeButton!: HeaderButton;

	remove_monkeys: (() => void)[] = [];

	database: Database<CriticMarkupNode[]> = new Database(
		this,
		'commentator/cache',
		'Commentator cache',
		3,
		'Vault-wide cache for Commentator plugin',
		() => [],
		async (file) => {
			return getNodesInText(await this.app.vault.cachedRead(file as TFile)).nodes;
		},
		2,
		(data: CriticMarkupNode[]) => {
			return data.map(node => Object.setPrototypeOf(node, NODE_PROTOTYPE_MAPPER[node.type].prototype));
		},
	);

	postProcessor!: MarkdownPostProcessor;

	loadEditorExtensions() {
		this.editorExtensions.length = 0;

		this.editorExtensions.push(keybindExtensions);
		this.editorExtensions.push(nodeParser);

		if (this.settings.comment_style === 'icon' || this.settings.comment_style === 'block')
			this.editorExtensions.push(commentRenderer(this.settings));
		if (this.settings.comment_style === 'block')
			this.editorExtensions.push(commentGutter);

		if (this.settings.live_preview) {
			this.editorExtensions.push(markupRenderer(this.settings));
		}

		// TODO: Rerender gutter on Ctrl+Scroll
		// TODO: Check performance costs of statefield vs viewport gutter
		if (this.settings.editor_gutter)
			this.editorExtensions.push(criticmarkupGutter(this));

		// Performance: ~1ms in stress-test
		if (this.settings.suggest_mode)
			this.editorExtensions.push(suggestionMode(this.settings));

		if (this.settings.tag_completion)
			this.editorExtensions.push(bracketMatcher);
		if (this.settings.node_correcter)
			this.editorExtensions.push(nodeCorrecter);

		this.editorExtensions.push(EditorView.domEventHandlers({
			copy: text_copy.bind(null, this.settings),
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
		this.registerView(CRITICMARKUP_VIEW, (leaf) => new CriticMarkupView(leaf, this));

		this.settings = Object.assign({}, this.settings, await this.loadData());
		this.previous_settings = Object.assign({}, this.settings);


		this.previewModeButton = previewModeButton(this);
		this.suggestionModeButton = suggestionModeButton(this);

		if (this.settings.editor_preview_button)
			this.previewModeButton.renderButtons();

		if (this.settings.editor_suggest_button)
			this.suggestionModeButton.renderButtons();


		this.addSettingTab(new CommentatorSettings(this.app, this));
		this.loadEditorExtensions();
		this.registerEditorExtension(this.editorExtensions);

		if (this.settings.post_processor) {
			// TODO: Run postprocessor before any other MD postprocessors
			this.postProcessor = this.registerMarkdownPostProcessor(async (el, ctx) => postProcess(el, ctx, this.settings), -99999);
			postProcessorUpdate();
		}

		this.registerEvent(cmenuCommands);
		// this.registerEvent(file_view_modes);

		commands.push({
			id: 'commentator-suggest-mode',
			name: 'Toggle suggestion mode',
			icon: 'comment',
			editor_context: true,
			regular_callback: async () => {
				this.settings.suggest_mode = !this.settings.suggest_mode;
				await this.saveSettings();
			},
		});

		commands.push({
			id: 'commentator-toggle-vim',
			name: '(DEBUG) Toggle Vim mode',
			icon: 'comment',
			regular_callback: async () => {
				this.app.vault.setConfig('vimMode', !this.app.vault.getConfig('vimMode'));
			},
		});

		commands.push({
			id: 'commentator-view',
			name: 'Open CriticMarkup view',
			icon: 'comment',
			regular_callback: async () => {
				await this.activateView();
			},
		});

		for (const command of commands) {
			if (Platform.isMobile || command.editor_context) {
				if (command.regular_callback) {
					command.editorCallback = command.regular_callback;
					delete command.regular_callback;
				} else {
					command.editorCheckCallback = command.check_callback;
					delete command.check_callback;
				}
			} else {
				if (command.regular_callback) {
					command.callback = command.regular_callback;
					delete command.regular_callback;
				} else {
					command.checkCallback = command.check_callback;
					delete command.check_callback;
				}
			}
			this.addCommand(command);
		}

		this.remove_monkeys.push(around(this.app.plugins, {
			uninstallPlugin: (oldMethod) => {
				return async (id: string) => {
					oldMethod && await oldMethod.apply(this.app.plugins, [id]);
					if (id === 'commentator') {
						await this.database.dropDatabase();
					}
				};
			},
		}));
	}

	async onunload() {
		this.previewModeButton.detachButtons();
		this.suggestionModeButton.detachButtons();

		MarkdownPreviewRenderer.unregisterPostProcessor(this.postProcessor);

		for (const monkey of this.remove_monkeys) monkey();

		this.database.unload();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);

		this.changed_settings = objectDifference(this.settings, this.previous_settings);
		this.previous_settings = Object.assign({}, this.settings);

		// Checks if settings are opened or not (prevents feedback loop with setting buttons calling saveSettings)
		if (this.app.setting.activateTab) {
			if (this.changed_settings.preview_mode !== undefined)
				await this.previewModeButton.updateButtons(this.settings.preview_mode);

			if (this.changed_settings.suggest_mode !== undefined)
				await this.suggestionModeButton.updateButtons(this.settings.suggest_mode ? 1 : 0);
		}

		if (this.changed_settings.show_editor_buttons_labels !== undefined) {
			this.previewModeButton.toggleLabels();
			this.suggestionModeButton.toggleLabels();
		}

		if (this.changed_settings.editor_preview_button !== undefined) {
			this.changed_settings.editor_preview_button ?
				this.previewModeButton.renderButtons() :
				this.previewModeButton.detachButtons();
		}

		if (this.changed_settings.editor_suggest_button !== undefined) {
			this.changed_settings.editor_suggest_button ?
				this.suggestionModeButton.renderButtons() :
				this.suggestionModeButton.detachButtons();
		}

		if (this.changed_settings.post_processor !== undefined) {
			if (this.changed_settings.post_processor)
				this.postProcessor = this.registerMarkdownPostProcessor((el, ctx) => postProcess(el, ctx, this.settings), -99999);
			else
				MarkdownPreviewRenderer.unregisterPostProcessor(this.postProcessor);
			postProcessorRerender();
		}

		await this.updateEditorExtension();
	}

	async setSetting<K extends keyof PluginSettings>(key: K, value: PluginSettings[K]) {
		this.settings[key] = value;
		await this.saveSettings();
	}

	async activateView() {
		this.app.workspace.detachLeavesOfType(CRITICMARKUP_VIEW);

		await this.app.workspace.getRightLeaf(false).setViewState({
			type: CRITICMARKUP_VIEW,
			active: true,
		});

		this.app.workspace.revealLeaf(
			this.app.workspace.getLeavesOfType(CRITICMARKUP_VIEW)[0],
		);
	}
}
