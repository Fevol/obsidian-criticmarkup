type EnumDictionary<T extends string | symbol | number, U> = {
	[K in T]: U;
};

export type StringNodeType = 'Addition' | 'Deletion' | 'Substitution' | 'Highlight' | 'Comment';

export enum NodeType {
	ADDITION,
	DELETION,
	SUBSTITUTION,
	HIGHLIGHT,
	COMMENT,
}

export const CM_NodeTypes: EnumDictionary<string, NodeType> = {
	'Addition': NodeType.ADDITION,
	'Deletion': NodeType.DELETION,
	'Substitution': NodeType.SUBSTITUTION,
	'Highlight': NodeType.HIGHLIGHT,
	'Comment': NodeType.COMMENT,
};

export const CM_Syntax: EnumDictionary<NodeType, [string, string]> = {
	[NodeType.ADDITION]: ['+', '+'],
	[NodeType.DELETION]: ['-', '-'],
	[NodeType.SUBSTITUTION]: ['~', '~'],
	[NodeType.HIGHLIGHT]: ['=', '='],
	[NodeType.COMMENT]: ['>', '<'],
};

export const CM_All_Brackets: EnumDictionary<NodeType, string[]> = {
	[NodeType.ADDITION]: ['{++', '++}'],
	[NodeType.DELETION]: ['{--', '--}'],
	[NodeType.SUBSTITUTION]: ['{~~', '~>', '~~}'],
	[NodeType.HIGHLIGHT]: ['{==', '==}'],
	[NodeType.COMMENT]: ['{>>', '<<}'],
};

export const CM_Brackets: { [key: string]: string[] } = {
	'{++': ['++}'],
	'{--': ['--}'],
	'{~~': ['~>', '~~}'],
	'{==': ['==}'],
	'{>>': ['<<}'],
};

export const NODE_ICON_MAPPER = {
	[NodeType.ADDITION]: 'plus-circle',
	[NodeType.DELETION]: 'minus-square',
	[NodeType.SUBSTITUTION]: 'replace',
	[NodeType.HIGHLIGHT]: 'highlighter',
	[NodeType.COMMENT]: 'message-square',
};
