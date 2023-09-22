// Prevents circular dependencies

import { AdditionNode, CommentNode, DeletionNode, HighlightNode, SubstitutionNode } from './types';
import { NodeType } from './definitions';

export const NODE_PROTOTYPE_MAPPER = {
	[NodeType.ADDITION]: AdditionNode,
	[NodeType.DELETION]: DeletionNode,
	[NodeType.HIGHLIGHT]: HighlightNode,
	[NodeType.SUBSTITUTION]: SubstitutionNode,
	[NodeType.COMMENT]: CommentNode,
};

export function constructNode(from: number, to: number, type: string, text: string, middle?: number) {
	switch (type) {
		case 'Addition':
			return new AdditionNode(from, to, text);
		case 'Deletion':
			return new DeletionNode(from, to, text);
		case 'Substitution':
			return new SubstitutionNode(from, middle!, to, text);
		case 'Highlight':
			return new HighlightNode(from, to, text);
		case 'Comment':
			return new CommentNode(from, to, text);
	}
}
