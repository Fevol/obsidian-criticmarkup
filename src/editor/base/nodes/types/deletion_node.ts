import { CM_All_Brackets, NodeType } from '../definitions';
import { CriticMarkupNode } from '../base-node';

export class DeletionNode extends CriticMarkupNode {
	constructor(from: number, to: number, text: string) {
		super(from, to, NodeType.DELETION, 'Deletion', text);
	}

	accept() {
		return '';
	}

	reject() {
		return this.unwrap();
	}

	postprocess(unwrap: boolean = true, livepreview_mode: number = 0, tag: string = "div", left: boolean | null = null, text?: string) {
		let str = text ?? this.text;
		if (!text && unwrap) {
			// Node is larger than what is actually given (no end bracket found within text)
			if (this.to >= str.length && !str.endsWith(CM_All_Brackets[this.type].at(-1)!))
				str = this.unwrap_bracket(true);
			/*else if (this.from === 0 && !str.startsWith(CM_All_Brackets[this.type][0]))
				str = this.unwrap_bracket(str, false);*/
			else
				str = this.unwrap();
		}
		if (!livepreview_mode)
			str = `<${tag} class='criticmarkup-preview criticmarkup-deletion'>${str}</${tag}>`;
		else if (livepreview_mode === 1)
			str = `<${tag} class='criticmarkup-preview'/>`;
		else
			str = `<${tag} class='criticmarkup-preview'>${str}</${tag}>`;
		return str;
	}
}