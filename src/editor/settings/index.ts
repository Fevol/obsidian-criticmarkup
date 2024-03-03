import { Compartment, Facet, StateEffect, StateEffectType, StateField } from '@codemirror/state';
import {PreviewMode} from "../../types";

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
		}
	});

	return field;
}



export const hideEmptyCommentGutterEffect = StateEffect.define<boolean>();
export const hideEmptyCommentGutterState = Facet.define<boolean, boolean>({
	combine: values => values[0]
});
export const hideEmptyCommentGutter = new Compartment();

export const defaultFoldCommentGutterState = Facet.define<boolean, boolean>({
	combine: values => values[0]
});
export const defaultFoldCommentGutter = new Compartment();

export const commentGutterFoldButtonEffect = StateEffect.define<boolean>();
export const commentGutterFoldButtonState = Facet.define<boolean, boolean>({
	combine: values => values[0]
});
export const commentGutterFoldButton = new Compartment();

export const commentGutterWidthEffect = StateEffect.define<number>();
export const commentGutterWidthState = Facet.define<number, number>({
	combine: values => values[0]
});
export const commentGutterWidth = new Compartment();


export const hideEmptySuggestionGutterEffect = StateEffect.define<boolean>();
export const hideEmptySuggestionGutterState = Facet.define<boolean, boolean>({
	combine: values => values[0]
});
export const hideEmptySuggestionGutter = new Compartment();

export const previewModeState = Facet.define<PreviewMode, PreviewMode>({
	combine: values => values[0]
});
export const previewMode = new Compartment();
