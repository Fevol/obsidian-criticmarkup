import {MarkdownView, Menu, MenuItem} from "obsidian";
import {around} from "monkey-around";

import type CommentatorPlugin from "./main";
import {annotationGutterView} from "./editor/renderers/gutters";

/**
 * Keep the context menu open after clicking on a menu item.
 * @param onSubmenu - Only keep the menu open if the item is a submenu.
 */
export const stickyContextMenuPatch = (onSubmenu = false) => {
    const patch = around(Menu.prototype, {
        onEnter: (oldMethod) => {
            return function(this: Menu, e: KeyboardEvent) {
                const selectedItem = this.items[this.selected];
                return selectedItem && selectedItem instanceof MenuItem && (selectedItem.handleEvent(e)) || true;
            };
        },
        onMenuClick: (oldMethod) => {
            return function(this: Menu, e: MouseEvent) {
                if (!onSubmenu || this.currentSubmenu && this.currentSubmenu.dom.contains(e.target as HTMLElement)) {
                    e.stopImmediatePropagation();
                } else {
                    return oldMethod && oldMethod.apply(this, [e]);
                }
            };
            // return () => {};
        },
        hide: (oldMethod) => {
            return function(this: Menu) {
                patch();
                return oldMethod && oldMethod.apply(this);
            };
        },
    });
    return patch;
}

/**
 * This patch extends the MarkdownView to synchronize config values added by this plugin to the persistent state.
 * It also ensures that these values are correctly set to the editor _before_ it is (re)initialized.
 * @param plugin - The Commentator plugin instance.
 */
export const syncEditorPersistentState = (plugin: CommentatorPlugin) => {
    return around(MarkdownView.prototype, {
        setState: (oldMethod) => {
            return async function (this: MarkdownView, viewState, eState?: any){
                // EXPL: If editMode.(width) is undefined (e.g. new view), set initial value to be inherited/default
                if (viewState && plugin.settings.annotation_gutter && this.editMode.annotationGutterWidth === undefined) {
                    this.editMode.annotationGutterWidth = viewState['annotationGutterWidth'] ?? plugin.settings.annotation_gutter_width;
                    this.editMode.annotationGutterFolded = viewState['annotationGutterFolded'] ?? plugin.settings.annotation_gutter_default_fold_state;
                }
                return oldMethod && oldMethod.apply(this, [viewState, eState]);
            }
        },

        getState: (oldMethod) => {
            return function (this: MarkdownView) {
                const state = oldMethod && oldMethod.apply(this);
                if (state) {
                    if (plugin.settings.annotation_gutter) {
                        // EXPL: When folding or resizing the gutter, requestSaveLayout is called to store the values
                        //		The following lines extract the new values from the gutters state
                        const gutter = this.editMode.cm.plugin(annotationGutterView)?.gutters[0];
                        if (gutter) {
                            this.editMode.annotationGutterWidth = gutter.width;
                            this.editMode.annotationGutterFolded = gutter.folded;
                        }
                        state['annotationGutterFolded' as keyof typeof state] = this.editMode.annotationGutterFolded;
                        state['annotationGutterWidth' as keyof typeof state] = this.editMode.annotationGutterWidth;
                    }
                }
                return state;
            }
        },

        // EXPL: Called on every file change, particularly hot path code
        //		 If clear is enabled, the extensions will be reloaded (guaranteed to be synchronous)
        //       Before the annotation gutter is initialized, set the inherited width/fold data in advance
        //       (The other alternative is updating gutter once loaded, and forcing a jarring re-render)
        // TODO: Find another way to communicate 'new' values to the gutter on initialization without animation
        setData: (oldMethod) => {
            return async function (this: MarkdownView, ...args) {
                // NOTE: Checking via args[1] (`clear`) to avoid potential errors due to future internal API changes
                if (args[1] && plugin.annotation_gutter_config !== undefined) {
                    plugin.annotation_gutter_config.width = this.editMode.annotationGutterWidth;
                    plugin.annotation_gutter_config.foldState = this.editMode.annotationGutterFolded;
                }
                return oldMethod && oldMethod.apply(this, args);
            };
        },

        // NOTE: Alternative that is only called when file is changed, but is not synchronous
        // loadFile: (oldMethod) => {
        // 	return async function (this: MarkdownView, ...args) {
        // 		if (plugin.annotation_gutter_config !== undefined) {
        // 			plugin.annotation_gutter_config.width = this.editMode.annotationGutterWidth;
        // 			plugin.annotation_gutter_config.foldState = this.editMode.annotationGutterFolded;
        // 		}
        // 		const output = oldMethod && await oldMethod.apply(this, args);
        // 		// EXPL: Ensures that correct config is always correctly communicated to the gutter,
        // 		//		 even if shared config above is overridden
        // 		// NOTE: If view is visible and config value different, the gutter _will_ animate to new state
        // 		//       Realistically, this is only an issue when loading a specific workspace when app is loaded
        // 		this.editMode.cm.dispatch({
        // 			annotations: [
        // 				annotationGutterWidthAnnotation.of(this.editMode.annotationGutterWidth),
        // 				annotationGutterFoldAnnotation.of(this.editMode.annotationGutterFolded),
        // 			]
        // 		});
        // 		return output;
        // 	}
        // },
    });
}

/**
 * This patch hooks into the Plugins class, and executes functionality before the plugin is uninstalled via the UI.
 * @param plugin - The Commentator plugin instance.
 * @param id - The ID of the plugin to be uninstalled.
 * @param cb - The callback function to be executed before the plugin is uninstalled.
 * @remarks If the plugin gets uninstalled via any other way (e.g. file system deletion, custom plugin API, ...),
 *          no guarantees can be made that the functionality will be executed.
 */
export const beforePluginUninstallPatch = (plugin: Plugin, id: string, cb: () => void | Promise<void>) => {
    return around(plugin.app.plugins, {
        uninstallPlugin: (oldMethod) => {
            return async (...args) => {
                try {
                    // NOTE: This is a safe check, if something changes in the future, this will just be ignored
                    if (args[0] === id) {
                        await cb();
                    }
                } catch (e) {
                    console.error("Error while executing beforePluginUninstallPatch callback:", e);
                }
                oldMethod && await oldMethod.apply(plugin.app.plugins, args);
            };
        },
    });
}

