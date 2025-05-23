import { PreviewMode } from "../../../../types";
import { CriticMarkupRange } from "../base_range";
import { CM_All_Brackets, SuggestionType } from "../definitions";

export class DeletionRange extends CriticMarkupRange {
	constructor(from: number, to: number, text: string, metadata?: number) {
		super(from, to, SuggestionType.DELETION, "Deletion", text, metadata);
	}

	accept() {
		return "";
	}

	reject() {
		return this.unwrap();
	}

	postprocess(
		unwrap: boolean = true,
		previewMode: PreviewMode = PreviewMode.ALL,
		tag: keyof HTMLElementTagNameMap = "div",
		left: boolean | null = null,
		text?: string,
	) {
		let str = text ?? this.text;
		if (!text && unwrap) {
			if (this.to >= str.length && !str.endsWith(CM_All_Brackets[this.type].at(-1)!))
				str = this.unwrap_bracket(true);
			else
				str = this.unwrap();
		}

		let cls = "cmtr-preview";
		if (previewMode === PreviewMode.ALL)
			cls += " cmtr-deletion";
		else if (previewMode === PreviewMode.ACCEPT)
			str = "";

		return `<${tag} class='${cls}'>${str}</${tag}>`;
	}
}
