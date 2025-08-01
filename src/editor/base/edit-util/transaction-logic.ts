import { Transaction } from "@codemirror/state";

export function getUserEvents(tr: Transaction) {
	// @ts-expect-error (Transaction has annotations)
	return tr.annotations.map(x => x.value).filter(x => typeof x === "string");
}
