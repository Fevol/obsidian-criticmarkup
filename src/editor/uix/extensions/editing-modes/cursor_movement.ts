import { EditorSelection, SelectionRange, Transaction, TransactionSpec } from "@codemirror/state";
import { PluginSettings } from "../../../../types";
import { cursor_move, is_forward_movement, rangeParser } from "../../../base";
import { latest_event } from "../keypress-catcher";

export function cursor_transaction_pass_syntax(
	tr: Transaction,
	userEvents: string[],
	vim_mode: boolean,
	settings: PluginSettings,
	event: KeyboardEvent,
): TransactionSpec | undefined {
	// NOTE: Pointer/Mouse selection does not need any further processing (allows for debugging)
	if (
		userEvents.includes("select.pointer") ||
		(latest_event && (event.key === "a" && (latest_event.ctrlKey || latest_event.metaKey)))
	) {
		return undefined;
	}

	let backwards_select = userEvents.includes("select.backward");
	let group_select = userEvents.includes("select.group");
	let is_selection = userEvents.includes("select.extend");
	if (!vim_mode && event) {
		backwards_select = event.key === "ArrowLeft";
		if (event.key === "ArrowLeft")
			backwards_select = true;
		else if (event.key === "ArrowRight")
			backwards_select = false;
		else
			backwards_select = !is_forward_movement(tr.startState.selection, tr.selection!);

		is_selection = event.shiftKey;
		group_select = event.ctrlKey || event.metaKey;
	}

	const ranges = tr.startState.field(rangeParser).ranges;
	const selections: SelectionRange[] = tr.selection!.ranges.map((range, idx) => {
		return cursor_move(
			tr.startState.selection!.ranges[idx],
			range,
			ranges,
			!backwards_select,
			group_select,
			is_selection,
			vim_mode,
			tr.startState,
			settings.suggestion_mode_operations.cursor_movement,
			settings.suggestion_mode_operations.bracket_movement,
		).selection;
	});

	// TODO: Check if filter should only apply in vim mode?
	return {
		selection: EditorSelection.create(selections),
		filter: false,
	};
}
