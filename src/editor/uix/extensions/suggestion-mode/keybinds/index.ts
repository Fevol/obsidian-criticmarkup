import { keymap } from '@codemirror/view';
import { deleteCharBackward, deleteCharForward, deleteGroupBackward, deleteGroupForward } from './delete';
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


// This here is saved as const for use in tests
export const overridden_keymap = [
	{ key: 'Backspace', run: deleteCharBackward, shift: deleteCharBackward, preventDefault: true },
	{ key: 'Delete', run: deleteCharForward, preventDefault: true },
	{ key: 'Mod-Backspace', mac: 'Alt-Backspace', run: deleteGroupBackward, preventDefault: true },
	{ key: 'Mod-Delete', mac: 'Alt-Delete', run: deleteGroupForward, preventDefault: true },
]

export const keybindExtensions = Prec.highest(keymap.of((overridden_keymap)));



