import {around} from "monkey-around";
import {Menu, MenuItem} from "obsidian";

/**
 * Keep the context menu open after clicking on a menu item.
 * @param onSubmenu - Only keep the menu open if the item is a submenu.
 */
export const keepContextMenuOpen = (onSubmenu = false) => {
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
