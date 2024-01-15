import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { suggestionMode } from '../src/editor/uix/extensions';

import {
	rangeParser, CriticMarkupRanges, SubstitutionRange,
	findBlockingChar, applyToText,
} from '../src/editor/base';

import { App } from 'obsidian';
import { DEFAULT_SETTINGS } from '../src/constants';

const test_cases = [
	'uv. wx yz',
	'{++x++}',
	'{++.++}',
	'{++ ++}',
	'x{++y++}z',
	'  {++y++}  ',
	'  {++x++}yz',
	'xy{++zu++}vw',
	'uv{++w++}x{++y++}z',
	'uv{++w++}{++y++}z',
	'{++.++}z',
	'ab{++cd++}{--     --}ef',
	'ac{++cd++}{--......--}ef',
	'ab{++cd++}{++++}{--......--}ef',
	'x{~~y~>z~~}u',
	'x{~~y~>z~~}{~~v~>w~~}ll',
	'x{~~~>~~}u',
];

// @ts-ignore (Doesn't like me assigning partial app to App)
global.app = <Partial<App>>{
	workspace: {
		activeEditor: null,
	},
};

const movement_directions = ['ArrowLeft', 'ArrowRight', 'Mod-ArrowLeft', 'Mod-ArrowRight'];

const keyboard_events: KeyboardEvent[] = [
	new KeyboardEvent('keydown', { key: 'ArrowLeft' }),
	new KeyboardEvent('keydown', { key: 'ArrowRight' }),
	new KeyboardEvent('keydown', { key: 'ArrowLeft', ctrlKey: true }),
	new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true }),
];


function visualize_cursor_location(text: string, position: number) {
	return text.substring(0, position) + '░' + text.substring(position);
}

function visualize_cursor_movement(text: string, from: number, to: number) {
	return visualize_cursor_location(text, from) + '\t⟶\t' + visualize_cursor_location(text, to);
}


// Visualizes the possible cursor locations (as if it were a normal string)
// If entry is cross ₓ, then the cursor may not land at that location
// If entry is a number, it represents being the i-th character of the original text
function visualize_mapping(text: string, mapping: number[]) {
	const subscript_numbers = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
	const superscript_numbers = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
	const subscript_cross = 'ₓ';
	const superscript_cross = 'ˣ';

	let result = '';
	for (let i = 0; i < text.length; i++) {
		result += mapping[i] === -1 ? subscript_cross : subscript_numbers[mapping[i]];
		result += text[i];
	}

	for (let i = text.length; i <= mapping.length - 1; i++) {
		result += mapping[i] === -1 ? superscript_cross : superscript_numbers[mapping[i]];
	}

	return result;
}


// This function gives the position of the cursor where it SHOULD end
// If an entry is -1, the cursor landed in an invalid spot (where cursor could and should not be able to enter)
// If an entry is positive, the number represents the cursor location in the original text, defined by index
function character_mapper(ranges: CriticMarkupRanges, positions: number[], left: boolean = false) {
	const mapping = [];
	let original_cursor_location = -1;
	for (const position of positions) {
		const range = ranges.at_cursor(position);

		if (range) {
			if (position === range.to && ranges.adjacent_range(range, !left, true)?.from) {
				mapping.push(-1);
			} else if (range.touches_left_bracket(position, true, !left)) {
				if (left && position === range.from + 3) {
					original_cursor_location += 1;
					mapping.push(original_cursor_location);
				} else if (!left && position === range.from) {
					original_cursor_location += 1;
					mapping.push(original_cursor_location);
				} else {
					mapping.push(-1);
				}
			} else if (range.touches_right_bracket(position, true, left)) {
				if (left && position === range.to) {
					original_cursor_location += 1;
					mapping.push(original_cursor_location);
				} else if (!left && position === range.to - 3) {
					original_cursor_location += 1;
					mapping.push(original_cursor_location);
				} else {
					mapping.push(-1);
				}
			} else if (range.touches_separator(position, true, !left)) {
				if (!left && position === (<SubstitutionRange>range).middle) {
					original_cursor_location += 1;
					mapping.push(original_cursor_location);
				} else if (left && position === (<SubstitutionRange>range).middle + 2) {
					original_cursor_location += 1;
					mapping.push(original_cursor_location);
				} else {
					mapping.push(-1);
				}
			} else {
				original_cursor_location += 1;
				mapping.push(original_cursor_location);
			}
		} else {
			original_cursor_location += 1;
			mapping.push(original_cursor_location);
		}
	}

	return mapping;
}


for (let test_case of test_cases) {
	if (test_case.startsWith('{++') || test_case.endsWith('++}'))
		test_case = ' ' + test_case + ' ';
	describe(test_case, () => {
		const view = new EditorView({
			state: EditorState.create({
				doc: test_case,
				extensions: [rangeParser, suggestionMode(DEFAULT_SETTINGS)],
			}),
		});

		const ranges = view.state.field(rangeParser).ranges;

		const unwrapped_string = applyToText(test_case, (range, text) => range.unwrap(), ranges.ranges);

		const actual_view = new EditorView({
			state: EditorState.create({
				doc: unwrapped_string,
				extensions: [rangeParser, suggestionMode(DEFAULT_SETTINGS)],
			}),
		});


		const position_numbers = Array.from(Array(test_case.length + 1).keys());

		for (const direction of [0, 1, 2, 3]) {
			const left = direction % 2 === 0;
			describe(movement_directions[direction] + (left ? ' (⟵)' : ' (⟶)'), () => {
				let mapping: number[] = [];
				if (ranges.ranges.length) {
					mapping = character_mapper(ranges, position_numbers, left);
				} else {
					mapping = [...position_numbers];
				}
				// console.log(visualize_mapping(test_case, mapping) + (left ? ' (⟵)' : ' (⟶)'));

				for (const cursor of position_numbers) {
					test(visualize_cursor_movement(test_case, cursor, findBlockingChar(cursor, !left, view.state)[0]), () => {

						view.dispatch({ selection: { anchor: cursor, head: cursor } });


						let actual_cursor = mapping[cursor];
						if (actual_cursor === -1) {
							let potential_cursor_locations = [...mapping];
							potential_cursor_locations = left ? potential_cursor_locations.slice(cursor) : potential_cursor_locations.slice(0, cursor).reverse();
							actual_cursor = potential_cursor_locations.find(x => x !== -1)!;
						}


						actual_view.dispatch({ selection: { anchor: actual_cursor, head: actual_cursor } });

						const event = keyboard_events[direction];
						view.dom.dispatchEvent(event);
						actual_view.dom.dispatchEvent(event);

						setTimeout(() => {
							const new_cursor = mapping[view.state.selection.main.head];
							const new_actual_cursor = actual_view.state.selection.main.head;

							expect(new_cursor).toBe(new_actual_cursor);
						}, 0);
					});
				}
			});
		}
	});
}
