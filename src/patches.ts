import {MarkdownView, Menu, MenuItem, type Plugin} from "obsidian";
import {around} from "monkey-around";

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
                if (!this.parentMenu) {
                    patch();
                }
                return oldMethod && oldMethod.apply(this);
            };
        },
    });
    return patch;
}

/**
 * This patch extends the MarkdownView to synchronize config values added by your plugin to the persistent state.
 * It also ensures that these values are correctly set to the editor _before_ it is (re)initialized.
 * @param setState - Get persisted values from the state and load them into the view
 * @param getState - Get current values from the view and store in the state
 * @param beforeEditorReload - Synchronize values from state before the codemirror instance is initialized
 * @param afterEditorReload - Synchronize values from state after the codemirror instance is initialized
 * @remarks Any state values set by this patch will be automatically removed once this patch is uninstalled.
 */
export const syncMarkdownViewCustomStatePatch = (
    setState: (view: MarkdownView, state: Record<string, unknown>) => void | Promise<void>,
    getState: (view: MarkdownView, state: Record<string, unknown>) => void,
    beforeEditorReload: (view: MarkdownView) => void,
    afterEditorReload: (view: MarkdownView) => void = () => {}
) => {
    return around(MarkdownView.prototype, {
        setState: (oldMethod) => {
            return async function (this: MarkdownView, ...args){
                if (args[0]) {
                    await setState(this, args[0]);
                }
                return oldMethod && oldMethod.apply(this, args);
            }
        },

        getState: (oldMethod) => {
            return function (this: MarkdownView) {
                const state = oldMethod && oldMethod.apply(this);
                if (state) {
                    getState(this, state);
                }
                return state;
            }
        },

        // EXPL: Called on every file change, particularly hot path code
        //		 If clear is enabled, the extensions will be reloaded (guaranteed to be synchronous)
        setData: (oldMethod) => {
            return async function (this: MarkdownView, ...args) {
                // NOTE: Checking via args[1] (`clear`) will only execute syncState if the file is changed
                if (args[1]) {
                    beforeEditorReload(this);
                }
                const output = oldMethod && oldMethod.apply(this, args);
                if (args[1]) {
                    afterEditorReload(this);
                }
                return output;
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

