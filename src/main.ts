import { type MarkdownPostProcessor, MarkdownPreviewRenderer, Plugin, TFile } from 'obsidian';

import { EditorView } from '@codemirror/view';
import { type Extension } from '@codemirror/state';

import { around } from 'monkey-around';

import {
	nodeParser, type CriticMarkupNode, NODE_PROTOTYPE_MAPPER,
	getNodesInText, text_copy
} from './editor/base';

import { suggestion_commands, editor_commands, application_commmands, initializeCommands, cmenuCommands } from './editor/uix';
import { nodeCorrecter, bracketMatcher, suggestionMode, keybindExtensions } from './editor/uix/extensions';

import { postProcess, postProcessorRerender, postProcessorUpdate } from './editor/renderers/post-process';
import { markupRenderer, commentRenderer } from './editor/renderers/live-preview';
import { criticmarkupGutter, commentGutter } from './editor/renderers/gutters';
import { type HeaderButton, previewModeHeaderButton, suggestionModeHeaderButton } from './editor/view-header';
import { type StatusBarButton, previewModeStatusBarButton, suggestionModeStatusBarButton } from './editor/status-bar';


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

	previewModeHeaderButton!: HeaderButton;
	suggestionHeaderModeButton!: HeaderButton;

	previewModeStatusBarButton!: StatusBarButton;
	suggestionModeStatusBarButton!: StatusBarButton;

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
		this.settings.database_workers,
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


		this.previewModeHeaderButton = previewModeHeaderButton(this);
		this.suggestionHeaderModeButton = suggestionModeHeaderButton(this);

		this.previewModeStatusBarButton = previewModeStatusBarButton(this);
		this.suggestionModeStatusBarButton = suggestionModeStatusBarButton(this);


		if (this.settings.editor_preview_button)
			this.previewModeHeaderButton.renderButtons();

		if (this.settings.editor_suggest_button)
			this.suggestionHeaderModeButton.renderButtons();

		if (this.settings.status_bar_preview_button)
			this.previewModeStatusBarButton.renderButton();

		if (this.settings.status_bar_suggest_button)
			this.suggestionModeStatusBarButton.renderButton();




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

		const commands = [
			...suggestion_commands,
			...editor_commands,
			...application_commmands(this),
		];

		initializeCommands(commands);
		for (const command of commands)
			this.addCommand(command);


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
		this.previewModeHeaderButton.detachButtons();
		this.suggestionHeaderModeButton.detachButtons();

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

		if (this.changed_settings.preview_mode !== undefined) {
			this.previewModeStatusBarButton.updateButton(this.settings.preview_mode);
			await this.previewModeHeaderButton.updateButtons(this.settings.preview_mode);
		}

		if (this.changed_settings.suggest_mode !== undefined) {
			this.suggestionModeStatusBarButton.updateButton(this.settings.suggest_mode ? 1 : 0);
			await this.suggestionHeaderModeButton.updateButtons(this.settings.suggest_mode ? 1 : 0);
		}

		if (this.changed_settings.show_editor_buttons_labels !== undefined) {
			this.previewModeHeaderButton.toggleLabels();
			this.suggestionHeaderModeButton.toggleLabels();
		}

		if (this.changed_settings.editor_preview_button !== undefined) {
			this.changed_settings.editor_preview_button ?
				this.previewModeHeaderButton.renderButtons() :
				this.previewModeHeaderButton.detachButtons();
		}

		if (this.changed_settings.editor_suggest_button !== undefined) {
			this.changed_settings.editor_suggest_button ?
				this.suggestionHeaderModeButton.renderButtons() :
				this.suggestionHeaderModeButton.detachButtons();
		}

		if (this.changed_settings.status_bar_preview_button !== undefined) {
			this.changed_settings.status_bar_preview_button ?
				this.previewModeStatusBarButton.renderButton() :
				this.previewModeStatusBarButton.detachButton();
		}

		if (this.changed_settings.status_bar_suggest_button !== undefined) {
			this.changed_settings.status_bar_suggest_button ?
				this.suggestionModeStatusBarButton.renderButton() :
				this.suggestionModeStatusBarButton.detachButton();
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
