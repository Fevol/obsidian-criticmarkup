import { Compartment, type Extension, Facet, RangeSet, RangeValue } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { App, MarkdownView } from "obsidian";

export function updateCompartment(
	extensions: Extension[],
	compartment: Compartment,
	new_compartment_contents: Extension,
) {
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
	// @ts-expect-error (Accessing compartment directly of an Extension created by compartment)
	const extensionIndex = extensions.findIndex(extension => extension?.compartment === compartment);
	// @ts-expect-error (Idem issue)
	extensions[extensionIndex] = (extensions[extensionIndex].compartment as Compartment).of(new_compartment_contents);
}

export function updateAllCompartments<T>(
	app: App,
	extensions: Extension[],
	compartment: Compartment,
	facet: Facet<T, T>,
	value: T,
) {
	/**
	 * Iterate over all active CodeMirror instances and update the facet value of the compartment,
	 * also updates the gutter of the active instances
	 */
	iterateAllCMInstances(app, cm => {
		cm.dispatch({ effects: [compartment.reconfigure(facet.of(value))] });
	});
	updateCompartment(extensions, compartment, facet.of(value));
}

export function debugRangeset<Type extends RangeValue>(
	set: RangeSet<Type>,
): { from: number; to: number; value: Type }[] {
	const ptr = set.iter();
	const output: { from: number; to: number; value: Type }[] = [];
	while (ptr.value) {
		output.push({ from: ptr.from, to: ptr.to, value: ptr.value });
		ptr.next();
	}
	return output;
}

export function iterateAllCMInstances(app: App, callback: (cm: EditorView) => void) {
	app.workspace.iterateAllLeaves((leaf) => {
		// @ts-ignore
		if (leaf.view instanceof MarkdownView && leaf.view.currentMode.type === "source") {
			// @ts-ignore
			callback(leaf.view.editor.cm);
		}
	});
}
