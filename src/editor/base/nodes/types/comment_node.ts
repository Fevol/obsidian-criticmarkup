import { NodeType } from '../definitions';
import { CriticMarkupNode } from '../base-node';

export class CommentNode extends CriticMarkupNode {
	reply_depth = 0;
	attached_comment: CriticMarkupNode | null = null;

	get base_node(): CriticMarkupNode {
		return this.attached_comment || this;
	}

	attach_to_node(node: CriticMarkupNode) {
		node.replies.push(this);
		this.reply_depth = node.replies.length - (node.type === NodeType.COMMENT ? 0 : 1);
		this.attached_comment = node;
	}

	constructor(from: number, to: number, text: string, metadata?: number) {
		super(from, to, NodeType.COMMENT, 'Comment', text, metadata);
	}
}

