import { NodeType } from '../definitions';
import { CriticMarkupNode } from '../base-node';

export class HighlightNode extends CriticMarkupNode {
	constructor(from: number, to: number, text: string) {
		super(from, to, NodeType.HIGHLIGHT, 'Highlight', text);
	}
}
