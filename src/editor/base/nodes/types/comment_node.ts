import { NodeType } from '../definitions';
import { CriticMarkupNode } from '../base-node';

export class CommentNode extends CriticMarkupNode {
	constructor(from: number, to: number, text: string) {
		super(from, to, NodeType.COMMENT, 'Comment', text);
	}
}
