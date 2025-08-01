import { Compartment, Facet, StateEffect, StateEffectType, StateField } from "@codemirror/state";
import { EditMode, PreviewMode } from "../../types";

/**
 * Provide a StateField extension for an arbitrary value that can be updated via effects
 * @param value - The initial value of the field
 * @param effect - Effect to update the value on
 * @remark Using implementation from Obsidian
 */
export function attachValue<T>(value: T, effect: StateEffectType<T>) {
	const field: StateField<T> = StateField.define({
		create() {
			return value;
		},

		update(e, n) {
			for (const curr_effect of n.effects) {
				if (curr_effect.is(effect))
					return curr_effect.value;
			}
			return value;
		},
	});

	return field;
}

export const annotationGutterIncludedTypesState = Facet.define<number, number>({ combine: values => values[0] });
export const annotationGutterIncludedTypes = new Compartment();

export const previewModeState = Facet.define<PreviewMode, PreviewMode>({ combine: values => values[0] });
export const previewMode = new Compartment();

export const editModeValueState = Facet.define<EditMode, EditMode>({ combine: values => values[0] });
export const editModeValue = new Compartment();
export const editMode = new Compartment();

export const fullReloadEffect = StateEffect.define<boolean>();
