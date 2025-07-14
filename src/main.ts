import {
	type MarkdownFileInfo, type MarkdownPostProcessor,
	MarkdownPreviewRenderer, MarkdownView,
	Notice, Plugin, TFile,
} from "obsidian";

import { type EditorState, type Extension, Prec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { type PluginSettings } from "./types";

import { Database } from "./database";
import { COMMENTATOR_GLOBAL } from "./global";
import { beforePluginUninstallPatch, syncMarkdownViewCustomStatePatch } from "./patches";

import { type CriticMarkupRange, getRangesInText, RANGE_PROTOTYPE_MAPPER, rangeParser, text_copy } from "./editor/base";
import { cmenuGlobalCommands, cmenuViewportCommands, commands } from "./editor/uix";
import { bracketMatcher, editorKeypressCatcher, getEditMode, rangeCorrecter, focusAnnotation } from "./editor/uix/extensions";
import {
	annotationGutter, annotationGutterCompartment, diffGutter, diffGutterCompartment,
	annotationGutterFoldButtonAnnotation, annotationGutterResizeHandleAnnotation,
	annotationGutterWidthAnnotation, annotationGutterHideEmptyAnnotation, annotationGutterView,
} from "./editor/renderers/gutters";
import { livepreviewRenderer, focusRenderer, markupFocusState } from "./editor/renderers/live-preview";
import { postProcess, postProcessorRerender, postProcessorUpdate } from "./editor/renderers/post-process";
import {
	type MetadataStatusBarButton, type StatusBarButton,
	metadataStatusBarButton, previewModeStatusBarButton, suggestionModeStatusBarButton,
} from "./editor/status-bar";
import { type HeaderButton, editModeHeaderButton, previewModeHeaderButton } from "./editor/view-header";

import { CommentatorSettings } from "./ui/settings";
import { COMMENTATOR_ANNOTATIONS_VIEW, CommentatorAnnotationsView } from "./ui/view.svelte";


import {
	DATABASE_VERSION, DEFAULT_SETTINGS, REQUIRES_DATABASE_REINDEX,
	REQUIRES_EDITOR_RELOAD, REQUIRES_FULL_RELOAD,
} from "./constants";
import {
	annotationGutterIncludedTypes, annotationGutterIncludedTypesState,
	editMode, editModeValue, editModeValueState,
	fullReloadEffect,
	hideEmptyDiffGutter, hideEmptyDiffGutterState,
	previewMode, previewModeState,
} from "./editor/settings";

import { debugRangeset, iterateAllCMInstances, sendAnnotationToAllCMInstances, updateAllCompartments, updateCompartment} from "./util/cm-util";
import { objectDifference } from "./util/util";

export default class CommentatorPlugin extends Plugin {
	editorExtensions: Extension[] = [];

	settings: PluginSettings = DEFAULT_SETTINGS;
	previous_settings: Partial<PluginSettings> = {};
	changed_settings: Partial<PluginSettings> = {};

	previewModeHeaderButton!: HeaderButton;
	editModeHeaderModeButton!: HeaderButton;

	previewModeStatusBarButton!: StatusBarButton;
	editModeStatusBarButton!: StatusBarButton;
	metadataStatusBarButton!: MetadataStatusBarButton;

	defaultEditModeExtension: Extension[] = [];

	settings_tab = "general";

	database: Database<CriticMarkupRange[]> = new Database(
		this,
		"commentator/cache",
		"Commentator cache",
		DATABASE_VERSION,
		"Vault-wide cache for Commentator plugin",
		() => [],
		async (file, state?: EditorState) => {
			return state ?
				state.field(rangeParser).ranges.ranges :
				getRangesInText(await this.app.vault.cachedRead(file as TFile));
		},
		this.settings.database_workers,
		(data: CriticMarkupRange[]) => {
			return data.map(range => Object.setPrototypeOf(range, RANGE_PROTOTYPE_MAPPER[range.type].prototype));
		},
		() => this.settings,
	);
	file_history: {
		mtime: number,
		changes: Record<string, string>,
	}[] = [];

	postProcessor!: MarkdownPostProcessor;

	// EXPL: Global configuration for annotation gutter, used as a bodge to communicate the initial width and fold state
	//		 to annotation gutter(s), even if the codemirror instance has not been set up yet
	annotation_gutter_config?: { width: number; foldState: boolean } = undefined;

	loadEditorExtensions() {
		this.editorExtensions.length = 0;

		this.editorExtensions.push(markupFocusState);
		this.editorExtensions.push(Prec.highest(focusRenderer));
		this.editorExtensions.push(focusAnnotation(this.settings));
		this.editorExtensions.push(Prec.highest(editorKeypressCatcher));
		this.editorExtensions.push(editMode.of(getEditMode(this.settings.default_edit_mode, this.settings)));

		this.editorExtensions.push(rangeParser);

		if (this.settings.annotation_gutter) {
			const annotation_gutter = annotationGutter(this);
			// FIXME: Bad. Bad. Bad. This is drivel of the highest degree.
			this.annotation_gutter_config = (annotation_gutter as unknown as any)[1][1].value;
			this.editorExtensions.push(annotationGutterCompartment.of(Prec.low(annotation_gutter)));
		}

		if (this.settings.live_preview) {
			this.editorExtensions.push(
				Prec.low(livepreviewRenderer(this.settings)),
			);
		}

		// TODO: Rerender gutter on Ctrl+Scroll
		if (this.settings.diff_gutter) {
			// NOTE: Prec.low moves the gutter to the right of the line numbers gutter
			//		This is consistent with how IDE's display diffs
			this.editorExtensions.push(Prec.low(diffGutterCompartment.of(diffGutter)));
		}

		if (this.settings.tag_completion)
			this.editorExtensions.push(bracketMatcher);
		if (this.settings.tag_correcter)
			this.editorExtensions.push(rangeCorrecter);

		this.editorExtensions.push(EditorView.domEventHandlers({
			copy: text_copy.bind(null, this.settings),
		}));

		this.editorExtensions.push(
			hideEmptyDiffGutter.of(hideEmptyDiffGutterState.of(this.settings.diff_gutter_hide_empty))
		);

		this.editorExtensions.push(previewMode.of(previewModeState.of(this.settings.default_preview_mode)));
		this.editorExtensions.push(editModeValue.of(editModeValueState.of(this.settings.default_edit_mode)));
		this.editorExtensions.push(
			annotationGutterIncludedTypes.of(annotationGutterIncludedTypesState.of(this.settings.annotation_gutter_included_types))
		);

		this.register(
			// TODO: Find another way to communicate 'new' values to the gutter on initialization without animation
			syncMarkdownViewCustomStatePatch(
				(view, state)	=> {
					// EXPL: If editMode.(width) is undefined (e.g. new view), set initial value to be inherited/default
					if (this.settings.annotation_gutter && view.editMode.annotationGutterWidth === undefined) {
						view.editMode.annotationGutterWidth = state['annotationGutterWidth'] as number ?? this.settings.annotation_gutter_width;
						view.editMode.annotationGutterFolded = state['annotationGutterFolded'] as boolean ?? this.settings.annotation_gutter_default_fold_state;
					}
				},
				(view, state) => {
					if (this.settings.annotation_gutter) {
						// EXPL: When folding or resizing the gutter, requestSaveLayout is called to store the values
						//		 The following lines extract the new values from the gutters state
						const gutter = view.editMode.cm.plugin(annotationGutterView)?.gutters[0];
						if (gutter) {
							view.editMode.annotationGutterWidth = gutter.width;
							view.editMode.annotationGutterFolded = gutter.folded;
						}
						state.annotationGutterFolded = view.editMode.annotationGutterFolded;
						state.annotationGutterWidth = view.editMode.annotationGutterWidth;
					}
				},
				// EXPL: Before the annotation gutter is initialized, set the inherited width/fold data in advance
				// 		 (The other alternative is updating gutter once loaded, and forcing a jarring re-render)
				(view) => {
					if (this.annotation_gutter_config !== undefined) {
						this.annotation_gutter_config.width = view.editMode.annotationGutterWidth;
						this.annotation_gutter_config.foldState = view.editMode.annotationGutterFolded;
					}
				}

		));
	}

	async updateEditorExtension() {
		if (Object.keys(this.changed_settings).some(key => REQUIRES_FULL_RELOAD.has(key))) {
			this.loadEditorExtensions();
			this.app.workspace.updateOptions();
			if (this.settings.post_processor)
				postProcessorUpdate(this.app);
		} else if (Object.keys(this.changed_settings).some(key => REQUIRES_EDITOR_RELOAD.has(key))) {
			// TODO: Check if it is possible to catch the effect fired by the updateOptions statefield
			iterateAllCMInstances(this.app, (cm) => {
				cm.dispatch(cm.state.update({
					effects: fullReloadEffect.of(true),
				}));
			});
		}
	}

	async onload() {
		if (process.env.NODE_ENV === "development") {
			console.log("Commentator plugin loaded in debug mode");

			// NOTE: debug options only accessible via main Obsidian window
			// @ts-expect-error (Assigning to window)
			window["COMMENTATOR_DEBUG"] = {
				plugin: this,
				database: this.database,
				get ranges() {
					return this.app.workspace.activeEditor?.editor?.cm.state.field(rangeParser).ranges.ranges;
				},
				get tree() {
					return this.app.workspace.activeEditor?.editor?.cm.state.field(rangeParser).ranges.tree;
				},
				debugRangeset
			};
		}


		this.registerView(COMMENTATOR_ANNOTATIONS_VIEW, (leaf) => new CommentatorAnnotationsView(leaf, this));

		await this.migrateSettings(await this.loadData());


		this.defaultEditModeExtension = getEditMode(this.settings.default_edit_mode, this.settings);

		this.addSettingTab(new CommentatorSettings(this.app, this));
		this.loadEditorExtensions();
		this.registerEditorExtension(this.editorExtensions);

		// EXPL: CM editor may not be fully loaded when header buttons are attached
		//   	Since the header buttons requires an initial value from their corresponding editor facet
		this.app.workspace.onLayoutReady(() => {
			this.previewModeHeaderButton = previewModeHeaderButton(this, this.settings.toolbar_preview_button);
			this.editModeHeaderModeButton = editModeHeaderButton(this, this.settings.toolbar_edit_button);
		});

		this.previewModeStatusBarButton = previewModeStatusBarButton(this, this.settings.status_bar_preview_button);
		this.editModeStatusBarButton = suggestionModeStatusBarButton(this, this.settings.status_bar_edit_button);
		this.metadataStatusBarButton = metadataStatusBarButton(this, this.settings.status_bar_metadata_button);


		if (this.settings.post_processor) {
			// TODO: Run postprocessor before any other MD postprocessors
			this.postProcessor = this.registerMarkdownPostProcessor(
				async (el, ctx) => postProcess(el, ctx, this),
				-99999,
			);
			// Full postprocessor rerender on enabling the plugin?
			postProcessorRerender(this.app);
		}

		this.registerEvent(cmenuGlobalCommands(this.app));
		this.registerEvent(cmenuViewportCommands(this.app));
		for (const command of commands(this)) {
			this.addCommand(command);
		}

		this.register(beforePluginUninstallPatch(this, "commentator", () => {
			return this.database.dropDatabase();
		}));
	}

	async migrateSettings(new_settings: PluginSettings) {
		const original_settings = this.settings;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, new_settings);
		this.previous_settings = Object.assign({}, original_settings, this.settings);
		COMMENTATOR_GLOBAL.PLUGIN_SETTINGS = this.settings;

		// EXPL: Do not migrate new installs, immediately save settings
		if (new_settings === null)
			await this.setSettings();
		else {
			const old_version = new_settings?.version;
			// EXPL: Migration code for upgrading to a new version
			try {
				if (old_version !== DEFAULT_SETTINGS.version) {
					// EXPL: Migrate settings from 0.1.x, where the settings did not contain a version field
					if (!old_version) {
						this.app.workspace.onLayoutReady(async () => {
							new Notice("Commentator: rebuilding database for new version", 5000);
							new Notice(
								"Commentator: metadata and replies features are now available, you can opt-in to these features in the settings",
								0,
							);
						});
					}

					// EXPL: Migrate settings from 0.2.x to 0.2.3, suggestion and comment gutter settings were renamed
					if (old_version.localeCompare("0.2.3", undefined, {numeric: true}) < 0) {
						if ((new_settings as any).suggestion_gutter_hide_empty) {
							const settings_migrations = [
								["suggestion_gutter", "diff_gutter"],
								["suggestion_gutter_hide_empty", "diff_gutter_hide_empty"],

								["comment_gutter_default_fold_state", "annotation_gutter_default_fold_state"],
								["comment_gutter_fold_button", "annotation_gutter_fold_button"],
								["comment_gutter_resize_handle", "annotation_gutter_resize_handle"],
								["comment_gutter_width", "annotation_gutter_width"],
								["comment_gutter_hide_empty", "annotation_gutter_hide_empty"],
							] as (keyof typeof new_settings)[][];

							for (const [old_key, new_key] of settings_migrations) {
								if (old_key in this.settings) {
									(this.settings as unknown as any)[new_key] = this.settings[old_key];
									delete this.settings[old_key];
								}
							}

							if (this.settings.comment_style as any === "block") {
								this.settings.comment_style = "icon";
								this.settings.annotation_gutter = true;
							}
						}
					}

					this.settings.version = DEFAULT_SETTINGS.version;
					await this.setSettings();
				}
			} catch (e) {
				new Notice("Commentator: Migration to new settings failed, using the default settings provided by the plugin", 0);
			}
		}
	}

	async onExternalSettingsChange() {
		await this.migrateSettings(await this.loadData());
	}

	async onunload() {
		this.previewModeHeaderButton.detachButtons();
		this.editModeHeaderModeButton.detachButtons();

		MarkdownPreviewRenderer.unregisterPostProcessor(this.postProcessor);

		this.database.unload();

		COMMENTATOR_GLOBAL.PLUGIN_SETTINGS = undefined!;
		if (process.env.NODE_ENV === "development") {
			// @ts-expect-error Remove debug variable from window
			window["COMMENTATOR_DEBUG"] = undefined;
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async setSettings() {
		COMMENTATOR_GLOBAL.PLUGIN_SETTINGS = this.settings;
		await this.saveData(this.settings);

		this.changed_settings = objectDifference(this.settings, this.previous_settings);
		this.previous_settings = Object.assign({}, this.settings);
	}

	async saveSettings() {
		await this.setSettings();

		this.previewModeHeaderButton.setLabelRendering(this.changed_settings.toolbar_show_buttons_labels);
		this.editModeHeaderModeButton.setLabelRendering(this.changed_settings.toolbar_show_buttons_labels);

		this.previewModeHeaderButton.setRendering(this.changed_settings.toolbar_preview_button);
		this.editModeHeaderModeButton.setRendering(this.changed_settings.toolbar_edit_button);

		this.previewModeStatusBarButton.setRendering(this.changed_settings.status_bar_preview_button);
		this.editModeStatusBarButton.setRendering(this.changed_settings.status_bar_edit_button);
		this.metadataStatusBarButton.setRendering(this.changed_settings.status_bar_metadata_button);

		// TODO: Is it guaranteed that only one configuration will always be changed?
		//		If so, then this can be reduced to a switch statement
		if (this.changed_settings.post_processor !== undefined) {
			if (this.changed_settings.post_processor) {
				this.postProcessor = this.registerMarkdownPostProcessor(
					(el, ctx) => postProcess(el, ctx, this),
					-99999,
				);
			} else {
				MarkdownPreviewRenderer.unregisterPostProcessor(this.postProcessor);
			}
			postProcessorRerender(this.app);
		}

		if (this.changed_settings.annotation_gutter_width !== undefined) {
			sendAnnotationToAllCMInstances(this.app, annotationGutterWidthAnnotation.of(this.settings.annotation_gutter_width));
		}

		if (this.changed_settings.annotation_gutter_hide_empty !== undefined) {
			sendAnnotationToAllCMInstances(this.app, annotationGutterHideEmptyAnnotation.of(this.settings.annotation_gutter_hide_empty));
		}

		if (this.changed_settings.diff_gutter_hide_empty !== undefined) {
			updateAllCompartments(
				this.app,
				this.editorExtensions,
				hideEmptyDiffGutter,
				hideEmptyDiffGutterState,
				this.settings.diff_gutter_hide_empty,
			);
		}

		if (this.changed_settings.annotation_gutter_fold_button !== undefined) {
			sendAnnotationToAllCMInstances(this.app, annotationGutterFoldButtonAnnotation.of(this.settings.annotation_gutter_fold_button));
		}

		if (this.changed_settings.annotation_gutter_resize_handle !== undefined) {
			sendAnnotationToAllCMInstances(this.app, annotationGutterResizeHandleAnnotation.of(this.settings.annotation_gutter_resize_handle));
		}

		if (this.changed_settings.default_preview_mode !== undefined) {
			updateCompartment(
				this.editorExtensions,
				previewMode,
				previewModeState.of(this.settings.default_preview_mode),
			);
		}
		if (this.changed_settings.default_edit_mode !== undefined) {
			updateCompartment(
				this.editorExtensions,
				editMode,
				getEditMode(this.settings.default_edit_mode, this.settings),
			);
			updateCompartment(
				this.editorExtensions,
				editModeValue,
				editModeValueState.of(this.settings.default_edit_mode),
			);
		}

		await this.updateEditorExtension();

		if (Object.keys(this.changed_settings).some(key => REQUIRES_DATABASE_REINDEX.has(key)))
			await this.database.reinitializeDatabase();
	}

	async setSetting<K extends keyof PluginSettings>(key: K, value: PluginSettings[K]) {
		this.settings[key] = value;
		await this.saveSettings();
	}

	async activateView() {
		this.app.workspace.detachLeavesOfType(COMMENTATOR_ANNOTATIONS_VIEW);

		await this.app.workspace.getRightLeaf(false)!.setViewState({
			type: COMMENTATOR_ANNOTATIONS_VIEW,
			active: true,
		});

		await this.app.workspace.revealLeaf(
			this.app.workspace.getLeavesOfType(COMMENTATOR_ANNOTATIONS_VIEW)[0],
		);
	}

	setEditMode(view: MarkdownFileInfo | null, mode: number) {
		if (view && view.editor) {
			view.editor.cm.dispatch(view.editor.cm.state.update({
				effects: [
					editMode.reconfigure(getEditMode(mode, this.settings)),
					editModeValue.reconfigure(editModeValueState.of(mode)),
				],
			}));

			this.editModeStatusBarButton.updateButton(mode);
			this.editModeHeaderModeButton.updateButton(view as MarkdownView, mode);
		}
	}

	setPreviewMode(view: MarkdownFileInfo | null, mode: number) {
		if (view && view instanceof MarkdownView) {
			if (view.editor) {
				view.editor.cm.dispatch(view.editor.cm.state.update({
					effects: [
						previewMode.reconfigure(previewModeState.of(mode)),
					],
				}));
			}

			if (view.previewMode) {
				view.previewMode.rerender(true);

				// FIXME: Surgical rerendering is broken
				// postProcessorUpdate(this.app);
			}

			this.previewModeStatusBarButton.updateButton(mode);
			this.previewModeHeaderButton.updateButton(view as MarkdownView, mode);
		}
	}
}
