import {
	MarkdownFileInfo, type MarkdownPostProcessor, MarkdownPreviewRenderer,
	MarkdownView, Notice, Plugin, TFile
}  from 'obsidian';

import {EditorView} from '@codemirror/view';
import {type EditorState, type Extension, Prec} from '@codemirror/state';

import {around} from 'monkey-around';

import {type CriticMarkupRange, getRangesInText, RANGE_PROTOTYPE_MAPPER, rangeParser, text_copy,} from './editor/base';

import {
	application_commmands,
	cmenuCommands,
	editor_commands,
	initializeCommands,
	suggestion_commands,
} from './editor/uix';
import {bracketMatcher, editorKeypressCatcher, rangeCorrecter} from './editor/uix/extensions';

import {postProcess, postProcessorRerender, postProcessorUpdate} from './editor/renderers/post-process';
import {commentRenderer, markupRenderer} from './editor/renderers/live-preview';
import {commentGutter, suggestionGutter} from './editor/renderers/gutters';
import {type HeaderButton, previewModeHeaderButton, editModeHeaderButton} from './editor/view-header';
import {
	type MetadataStatusBarButton,
	metadataStatusBarButton,
	previewModeStatusBarButton,
	type StatusBarButton,
	suggestionModeStatusBarButton
} from './editor/status-bar';


import {CRITICMARKUP_VIEW, CriticMarkupView} from './ui/view';
import {CommentatorSettings} from './ui/settings';

import {Database} from './database';

import {objectDifference} from './util/util';
import {DATABASE_VERSION, DEFAULT_SETTINGS, REQUIRES_FULL_RELOAD} from './constants';
import {type PluginSettings} from './types';
import {
	commentGutterFoldButton, commentGutterFoldButtonState,
	commentGutterWidth, commentGutterWidthState,
	editModeValue, editModeValueState, editMode,
	hideEmptyCommentGutter, hideEmptyCommentGutterState,
	hideEmptySuggestionGutter, hideEmptySuggestionGutterState,
	previewMode, previewModeState,
	commentGutterFolded, commentGutterFoldedState,
} from './editor/settings';
import {getEditMode} from "./editor/uix/extensions/editing-modes";
import {updateAllCompartments, updateCompartment} from "./util/cm-util";

export default class CommentatorPlugin extends Plugin {
	private editorExtensions: Extension[] = [];

	settings: PluginSettings = DEFAULT_SETTINGS;
	previous_settings: Partial<PluginSettings> = {};
	changed_settings: Partial<PluginSettings> = {};

	previewModeHeaderButton!: HeaderButton;
	editModeHeaderModeButton!: HeaderButton;

	previewModeStatusBarButton!: StatusBarButton;
	editModeStatusBarButton!: StatusBarButton;
	metadataStatusBarButton!: MetadataStatusBarButton;

	defaultEditModeExtension: Extension[] = [];

	remove_monkeys: (() => void)[] = [];

	settings_tab = 'general';

	database: Database<CriticMarkupRange[]> = new Database(
		this,
		'commentator/cache',
		'Commentator cache',
		DATABASE_VERSION,
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
		if (this.settings.editor_gutter)
			this.editorExtensions.push(suggestionGutter);

		this.editorExtensions.push(editMode.of(getEditMode(this.settings.default_edit_mode, this.settings)));

		if (this.settings.tag_completion)
			this.editorExtensions.push(bracketMatcher);
		if (this.settings.tag_correcter)
			this.editorExtensions.push(rangeCorrecter);

		this.editorExtensions.push(EditorView.domEventHandlers({
			copy: text_copy.bind(null, this.settings),
		}));

		this.editorExtensions.push(hideEmptySuggestionGutter.of(hideEmptySuggestionGutterState.of(this.settings.suggestion_gutter_hide_empty)));
		this.editorExtensions.push(commentGutterWidth.of(commentGutterWidthState.of(this.settings.comment_gutter_width)));
		this.editorExtensions.push(hideEmptyCommentGutter.of(hideEmptyCommentGutterState.of(this.settings.comment_gutter_hide_empty)));
		this.editorExtensions.push(commentGutterFolded.of(commentGutterFoldedState.of(this.settings.comment_gutter_default_fold_state)));
		this.editorExtensions.push(commentGutterFoldButton.of(commentGutterFoldButtonState.of(this.settings.comment_gutter_fold_button)));
		this.editorExtensions.push(previewMode.of(previewModeState.of(this.settings.default_preview_mode)));
		this.editorExtensions.push(editModeValue.of(editModeValueState.of(this.settings.default_edit_mode)));
	}

	async updateEditorExtension() {
		if (Object.keys(this.changed_settings).some(key => REQUIRES_FULL_RELOAD.has(key))) {
			this.loadEditorExtensions();
			this.app.workspace.updateOptions();
			if (this.settings.post_processor)
				postProcessorUpdate();
		}
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

		this.previewModeHeaderButton = previewModeHeaderButton(this, this.settings.toolbar_preview_button);
		this.editModeHeaderModeButton = editModeHeaderButton(this, this.settings.toolbar_suggest_button);

		this.previewModeStatusBarButton = previewModeStatusBarButton(this, this.settings.status_bar_preview_button);
		this.editModeStatusBarButton = suggestionModeStatusBarButton(this, this.settings.status_bar_suggest_button);
		this.metadataStatusBarButton = metadataStatusBarButton(this, this.settings.status_bar_metadata_button);

		this.defaultEditModeExtension = getEditMode(this.settings.default_edit_mode, this.settings);

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
			...suggestion_commands(this),
			...editor_commands(this),
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

		// EXPL: Migration code for upgrading to new version
		if (old_version !== DEFAULT_SETTINGS.version) {
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
		this.editModeHeaderModeButton.detachButtons();

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

		this.previewModeHeaderButton.setLabelRendering(this.changed_settings.toolbar_show_buttons_labels);
		this.editModeHeaderModeButton.setLabelRendering(this.changed_settings.toolbar_show_buttons_labels);

		this.previewModeHeaderButton.setRendering(this.changed_settings.toolbar_preview_button);
		this.editModeHeaderModeButton.setRendering(this.changed_settings.toolbar_suggest_button);

		this.previewModeStatusBarButton.setRendering(this.changed_settings.status_bar_preview_button);
		this.editModeStatusBarButton.setRendering(this.changed_settings.status_bar_suggest_button);
		this.metadataStatusBarButton.setRendering(this.changed_settings.status_bar_metadata_button);


		if (this.changed_settings.post_processor !== undefined) {
			if (this.changed_settings.post_processor)
				this.postProcessor = this.registerMarkdownPostProcessor((el, ctx) => postProcess(el, ctx, this.settings), -99999);
			else
				MarkdownPreviewRenderer.unregisterPostProcessor(this.postProcessor);
			postProcessorRerender();
		}

		if (this.changed_settings.comment_gutter_width !== undefined)
			updateAllCompartments(this.editorExtensions, commentGutterWidth, commentGutterWidthState, this.settings.comment_gutter_width);

		if (this.changed_settings.comment_gutter_hide_empty !== undefined)
			updateAllCompartments(this.editorExtensions, hideEmptyCommentGutter, hideEmptyCommentGutterState, this.settings.comment_gutter_hide_empty);

		if (this.changed_settings.suggestion_gutter_hide_empty !== undefined)
			updateAllCompartments(this.editorExtensions, hideEmptySuggestionGutter, hideEmptySuggestionGutterState, this.settings.suggestion_gutter_hide_empty);

		if (this.changed_settings.comment_gutter_fold_button !== undefined)
			updateAllCompartments(this.editorExtensions, commentGutterFoldButton, commentGutterFoldButtonState, this.settings.comment_gutter_fold_button);

		if (this.changed_settings.default_preview_mode !== undefined)
			updateCompartment(this.editorExtensions, previewMode, previewModeState.of(this.settings.default_preview_mode));
		if (this.changed_settings.default_edit_mode !== undefined) {
			updateCompartment(this.editorExtensions, editMode, getEditMode(this.settings.default_edit_mode, this.settings));
			updateCompartment(this.editorExtensions, editModeValue, editModeValueState.of(this.settings.default_edit_mode));
		}

		await this.updateEditorExtension();
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


	setEditMode(view: MarkdownFileInfo | null, mode: number) {
		if (view && view.editor) {
			view.editor.cm.dispatch(view.editor.cm.state.update({
				effects: [
					editMode.reconfigure(getEditMode(mode, this.settings)),
					editModeValue.reconfigure(editModeValueState.of(mode))
				]
			}));

			this.editModeStatusBarButton.updateButton(mode);
			this.editModeHeaderModeButton.updateButton(view as MarkdownView, mode);
		}
	}

	setPreviewMode(view: MarkdownFileInfo | null, mode: number) {
		if (view && view.editor) {
			view.editor.cm.dispatch(view.editor.cm.state.update({
				effects: [
					previewMode.reconfigure(previewModeState.of(mode))
				]
			}));

			this.previewModeStatusBarButton.updateButton(mode);
			this.previewModeHeaderButton.updateButton(view as MarkdownView, mode);
		}
	}
}
