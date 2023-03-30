import { keymap } from '@codemirror/view';
import { deleteCharBackward, deleteCharForward, deleteGroupBackward, deleteGroupForward } from './delete';
import {
	cursorCharLeft, selectCharLeft,
	cursorGroupLeft, selectGroupLeft,
	cursorLineBoundaryLeft, selectLineBoundaryLeft,
	cursorCharRight, selectCharRight,
	cursorGroupRight, selectGroupRight,
	cursorLineBoundaryRight, selectLineBoundaryRight,
	cursorLineUp, selectLineUp,
	cursorLineDown, selectLineDown,
	cursorDocStart, selectDocStart,
	cursorDocEnd, selectDocEnd,
	cursorPageUp, selectPageUp,
	cursorPageDown, selectPageDown,
} from './select';
import { Prec } from '@codemirror/state';


// Why these files exists, and why I am redefining the regular 'delete' keybind (same reasoning for select):
//   When deleting a selection, the 'delete.selection' event is added to the transaction.
//   However, the plugin *needs* to know which direction something was deleted in, so it can
//     determine whether it should place the cursor at the start or end of the deleted text.
//   Thus, the only way to implement this, is to add a custom event to the transaction
//     called 'delete.selection.forward' or 'delete.selection.backward', depending on the direction.

// NOTE: If this ever causes inconsistent behaviour, it might be due to either
//   1. Other plugin overwriting the key: 'Backspace' keybind
//   2. Obsidian changing the keybinds in some way
//   3. CodeMirror update breaking this

export const keybindExtensions = Prec.highest(keymap.of(([
	{key: "ArrowLeft", run: cursorCharLeft, shift: selectCharLeft, preventDefault: true},
	{key: "Mod-ArrowLeft", mac: "Alt-ArrowLeft", run: cursorGroupLeft, shift: selectGroupLeft, preventDefault: true},
	{mac: "Cmd-ArrowLeft", run: cursorLineBoundaryLeft, shift: selectLineBoundaryLeft, preventDefault: true},

	{key: "ArrowRight", run: cursorCharRight, shift: selectCharRight, preventDefault: true},
	{key: "Mod-ArrowRight", mac: "Alt-ArrowRight", run: cursorGroupRight, shift: selectGroupRight, preventDefault: true},
	{mac: "Cmd-ArrowRight", run: cursorLineBoundaryRight, shift: selectLineBoundaryRight, preventDefault: true},

	{key: "ArrowUp", run: cursorLineUp, shift: selectLineUp },
	{mac: "Cmd-ArrowUp", run: cursorDocStart, shift: selectDocStart, preventDefault: true},
	{mac: "Ctrl-ArrowUp", run: cursorPageUp, shift: selectPageUp, preventDefault: true},

	{key: "ArrowDown", run: cursorLineDown, shift: selectLineDown, preventDefault: true},
	{mac: "Cmd-ArrowDown", run: cursorDocEnd, shift: selectDocEnd, preventDefault: true},
	{mac: "Ctrl-ArrowDown", run: cursorPageDown, shift: selectPageDown, preventDefault: true},


	{ key: 'Backspace', run: deleteCharBackward, shift: deleteCharBackward, preventDefault: true },
	{ key: 'Delete', run: deleteCharForward, preventDefault: true },
	{ key: 'Mod-Backspace', mac: 'Alt-Backspace', run: deleteGroupBackward, preventDefault: true },
	{ key: 'Mod-Delete', mac: 'Alt-Delete', run: deleteGroupForward, preventDefault: true },
])));
