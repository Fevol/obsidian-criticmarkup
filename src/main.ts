import {type MarkdownPostProcessor, MarkdownPreviewRenderer, Notice, Plugin, TFile} from 'obsidian';

import { EditorView } from '@codemirror/view';
import { Compartment, type EditorState, type Extension, Facet, Prec, StateEffectType } from '@codemirror/state';

import { around } from 'monkey-around';

import {
	rangeParser, type CriticMarkupRange, RANGE_PROTOTYPE_MAPPER,
	getRangesInText, text_copy,
} from './editor/base';

import {
	suggestion_commands,
	editor_commands,
	application_commmands,
	initializeCommands,
	cmenuCommands,
} from './editor/uix';
import { rangeCorrecter, bracketMatcher, suggestionMode, editMode, editorKeypressCatcher } from './editor/uix/extensions';

import { postProcess, postProcessorRerender, postProcessorUpdate } from './editor/renderers/post-process';
import { markupRenderer, commentRenderer } from './editor/renderers/live-preview';
import { suggestionGutter, commentGutter } from './editor/renderers/gutters';
import { type HeaderButton, previewModeHeaderButton, suggestionModeHeaderButton } from './editor/view-header';
import {
	type StatusBarButton, type MetadataStatusBarButton,
	previewModeStatusBarButton,
	suggestionModeStatusBarButton,
	metadataStatusBarButton
} from './editor/status-bar';


import { CRITICMARKUP_VIEW, CriticMarkupView } from './ui/view';
import { CommentatorSettings } from './ui/settings';

import { Database } from './database';

import { iterateAllCMInstances, objectDifference } from './util';
import { DEFAULT_SETTINGS, REQUIRES_FULL_RELOAD } from './constants';
import { type PluginSettings } from './types';
import {
	commentGutterWidth, commentGutterWidthEffect, commentGutterWidthState,
	hideEmptyCommentGutter, hideEmptyCommentGutterEffect, hideEmptyCommentGutterState,
	hideEmptySuggestionGutter, hideEmptySuggestionGutterEffect, hideEmptySuggestionGutterState,
	defaultFoldCommentGutter, defaultFoldCommentGutterState,
	commentGutterFoldButton, commentGutterFoldButtonState, commentGutterFoldButtonEffect,
} from './editor/settings';

export default class CommentatorPlugin extends Plugin {
	private editorExtensions: Extension[] = [];

	settings: PluginSettings = DEFAULT_SETTINGS;
	previous_settings: Partial<PluginSettings> = {};
	changed_settings: Partial<PluginSettings> = {};

	previewModeHeaderButton!: HeaderButton;
	suggestionHeaderModeButton!: HeaderButton;

	previewModeStatusBarButton!: StatusBarButton;
	suggestionModeStatusBarButton!: StatusBarButton;
	metadataStatusBarButton!: MetadataStatusBarButton;

	remove_monkeys: (() => void)[] = [];

	settings_tab = 'general';

	database: Database<CriticMarkupRange[]> = new Database(
		this,
		'commentator/cache',
		'Commentator cache',
		4,
		'Vault-wide cache for Commentator plugin',
		() => [],
		async (file, state?: EditorState) => {
			return state ? state.field(rangeParser).ranges.ranges : getRangesInText(await this.app.vault.cachedRead(file as TFile));
		},
		this.settings.database_workers,
		(data: CriticMarkupRange[]) => {
			return data.map(range => Object.setPrototypeOf(range, RANGE_PROTOTYPE_MAPPER[range.type].prototype));
		},
	);

	postProcessor!: MarkdownPostProcessor;

	loadEditorExtensions() {
		// REMINDER: .init(() => ...) can be used to initialise a statefield

		this.editorExtensions.length = 0;

		this.editorExtensions.push(Prec.highest(editorKeypressCatcher));
		this.editorExtensions.push(rangeParser);

		if (this.settings.comment_style === 'icon' || this.settings.comment_style === 'block')
			this.editorExtensions.push(commentRenderer(this.settings));
		if (this.settings.comment_style === 'block')
			this.editorExtensions.push(commentGutter as Extension[]);

		if (this.settings.live_preview)
			this.editorExtensions.push(markupRenderer(this.settings));

		// TODO: Rerender gutter on Ctrl+Scroll
		// TODO: Check performance costs of statefield vs viewport gutter
		if (this.settings.editor_gutter)
			this.editorExtensions.push(suggestionGutter);

		if (this.settings.suggest_mode)
			this.editorExtensions.push(suggestionMode(this.settings));
		else if (this.settings.edit_mode)
			this.editorExtensions.push(editMode(this.settings));

		if (this.settings.tag_completion)
			this.editorExtensions.push(bracketMatcher);
		if (this.settings.tag_correcter)
			this.editorExtensions.push(rangeCorrecter);

		this.editorExtensions.push(EditorView.domEventHandlers({
			copy: text_copy.bind(null, this.settings),
		}));

		this.editorExtensions.push(hideEmptySuggestionGutter.of(hideEmptySuggestionGutterState.of(this.settings.hide_empty_suggestion_gutter)));
		this.editorExtensions.push(commentGutterWidth.of(commentGutterWidthState.of(this.settings.comment_gutter_width)));
		this.editorExtensions.push(hideEmptyCommentGutter.of(hideEmptyCommentGutterState.of(this.settings.hide_empty_comment_gutter)));
		this.editorExtensions.push(defaultFoldCommentGutter.of(defaultFoldCommentGutterState.of(this.settings.default_folded_comment_gutter)));
		this.editorExtensions.push(commentGutterFoldButton.of(commentGutterFoldButtonState.of(this.settings.comment_gutter_fold_button)));
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
		// Note: debug options only accessible via main Obsidian window
		// @ts-ignore (Assigning to window)
		window['COMMENTATOR_DEBUG'] = {
			plugin: this,
			database: this.database,
			get ranges() {
				return app.workspace.activeEditor?.editor?.cm.state.field(rangeParser).ranges.ranges;
			},
			get tree() {
				return app.workspace.activeEditor?.editor?.cm.state.field(rangeParser).ranges.tree;
			}
		};


		this.registerView(CRITICMARKUP_VIEW, (leaf) => new CriticMarkupView(leaf, this));

		await this.migrateSettings(await this.loadData());

		this.previewModeHeaderButton = previewModeHeaderButton(this, this.settings.editor_preview_button);
		this.suggestionHeaderModeButton = suggestionModeHeaderButton(this, this.settings.editor_suggest_button);

		this.previewModeStatusBarButton = previewModeStatusBarButton(this, this.settings.status_bar_preview_button);
		this.suggestionModeStatusBarButton = suggestionModeStatusBarButton(this, this.settings.status_bar_suggest_button);
		this.metadataStatusBarButton = metadataStatusBarButton(this, this.settings.status_bar_metadata_button);

		this.addSettingTab(new CommentatorSettings(this.app, this));
		this.loadEditorExtensions();
		this.registerEditorExtension(this.editorExtensions);

		if (this.settings.post_processor) {
			// TODO: Run postprocessor before any other MD postprocessors
			this.postProcessor = this.registerMarkdownPostProcessor(async (el, ctx) => postProcess(el, ctx, this.settings), -99999);
			// Full postprocessor rerender on enabling the plugin?
			postProcessorRerender();
		}

		this.registerEvent(cmenuCommands);
		// this.registerEvent(file_view_modes);

		const commands = [
			...suggestion_commands(this.settings),
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


	async migrateSettings(new_settings: PluginSettings) {
		const old_settings = this.settings;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, new_settings);
		this.previous_settings = Object.assign(old_settings, this.settings);

		const old_version = new_settings.version;
		const current_version = "0.2.0";

		// EXPL: Migration code for upgrading to new version
		if (old_version !== current_version) {
			if (!old_version) {
				this.app.workspace.onLayoutReady(async () => {
					new Notice("Commentator: rebuilding database for new version", 5000);
					new Notice("Commentator: metadata and replies features are now available, you can opt-in to these features in the settings", 0);
				});
			}

			await this.saveSettings();
		}
	}

	async onExternalSettingsChange() {
		await this.migrateSettings(await this.loadData());
	}

	async onunload() {
		this.previewModeHeaderButton.detachButtons();
		this.suggestionHeaderModeButton.detachButtons();

		MarkdownPreviewRenderer.unregisterPostProcessor(this.postProcessor);

		for (const monkey of this.remove_monkeys) monkey();

		this.database.unload();

		// @ts-expect-error Add debug variable to window
		window['COMMENTATOR_DEBUG'] = undefined;
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);

		this.changed_settings = objectDifference(this.settings, this.previous_settings);
		this.previous_settings = Object.assign({}, this.settings);

		this.previewModeStatusBarButton.updateButton(this.changed_settings.preview_mode);
		await this.previewModeHeaderButton.updateButtons(this.changed_settings.preview_mode);

		this.suggestionModeStatusBarButton.updateButton((this.changed_settings.suggest_mode));
		await this.suggestionHeaderModeButton.updateButtons(this.changed_settings.suggest_mode);

		this.previewModeHeaderButton.setLabelRendering(this.changed_settings.show_editor_buttons_labels);
		this.suggestionHeaderModeButton.setLabelRendering(this.changed_settings.show_editor_buttons_labels);

		this.previewModeHeaderButton.setRendering(this.changed_settings.editor_preview_button);
		this.suggestionHeaderModeButton.setRendering(this.changed_settings.editor_suggest_button);

		this.previewModeStatusBarButton.setRendering(this.changed_settings.status_bar_preview_button);
		this.suggestionModeStatusBarButton.setRendering(this.changed_settings.status_bar_suggest_button);
		this.metadataStatusBarButton.setRendering(this.changed_settings.status_bar_metadata_button);


		if (this.changed_settings.post_processor !== undefined) {
			if (this.changed_settings.post_processor)
				this.postProcessor = this.registerMarkdownPostProcessor((el, ctx) => postProcess(el, ctx, this.settings), -99999);
			else
				MarkdownPreviewRenderer.unregisterPostProcessor(this.postProcessor);
			postProcessorRerender();
		}

		if (this.changed_settings.comment_gutter_width !== undefined)
			this.sendFacetUpdate(commentGutterWidth, commentGutterWidthState,
								 commentGutterWidthEffect, this.settings.comment_gutter_width);

		if (this.changed_settings.hide_empty_comment_gutter !== undefined)
			this.sendFacetUpdate(hideEmptyCommentGutter, hideEmptyCommentGutterState,
								 hideEmptyCommentGutterEffect, this.settings.hide_empty_comment_gutter);

		if (this.changed_settings.hide_empty_suggestion_gutter !== undefined)
			this.sendFacetUpdate(hideEmptySuggestionGutter, hideEmptySuggestionGutterState,
								 hideEmptySuggestionGutterEffect, this.settings.hide_empty_suggestion_gutter);

		if (this.changed_settings.comment_gutter_fold_button !== undefined)
			this.sendFacetUpdate(commentGutterFoldButton, commentGutterFoldButtonState,
								 commentGutterFoldButtonEffect, this.settings.comment_gutter_fold_button);

		await this.updateEditorExtension();
	}

	sendFacetUpdate<T>(compartment: Compartment, facet: Facet<T, T>, effect: StateEffectType<T>, value: T) {
		/**
		 * Iterate over all active CodeMirror instances and update both the facet (via state effect of facet),
		 * 	and the gutter (via custom state effect)
		 */
		const stateFacetUpdate = compartment.reconfigure(facet.of(value));
		const gutterFacetUpdate = effect.of(value);
		iterateAllCMInstances(cm => {
			cm.dispatch({ effects: [ gutterFacetUpdate, stateFacetUpdate, ] });
		});

		/**
		 * What is this black magic?!
		 * In short: where the above updates the facet and gutter of *active* CM instances respectively,
		 * 	the code below updates the facet value of the extension by accessing the compartment instance
		 * 	and updating the attached extension (in this case, the facet)
		 * @remark This needs to be done very careful, creating a new compartment will give errors, and
		 *   defining a new facet on the compartment directly, will create a new facet that is different from
		 *   the one that is attached to other instances
		 * @todo A less bodgy solution would be nice
		 */
		// @ts-ignore (Accessing compartment directly of an Extension created by compartment)
		const extensionIndex = this.editorExtensions.findIndex(extension => extension?.compartment === compartment);
		// @ts-ignore (idem)
		this.editorExtensions[extensionIndex] = this.editorExtensions[extensionIndex].compartment.of(facet.of(value));
	}



	async setSetting<K extends keyof PluginSettings>(key: K, value: PluginSettings[K]) {
		this.settings[key] = value;
		await this.saveSettings();
	}

	async activateView() {
		this.app.workspace.detachLeavesOfType(CRITICMARKUP_VIEW);

		await this.app.workspace.getRightLeaf(false)!.setViewState({
			type: CRITICMARKUP_VIEW,
			active: true,
		});

		this.app.workspace.revealLeaf(
			this.app.workspace.getLeavesOfType(CRITICMARKUP_VIEW)[0],
		);
	}
}
