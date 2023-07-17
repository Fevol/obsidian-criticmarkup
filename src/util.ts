import { NodeType } from './types';

type EnumDictionary<T extends string | symbol | number, U> = {
	[K in T]: U;
};

export function objectDifference(new_obj: any, old_obj: any): Partial<typeof new_obj> {
	const diff: Partial<typeof new_obj> = {};
	for (const key in new_obj) {
		if (new_obj[key] !== old_obj[key])
			diff[key] = new_obj[key];
	}
	return diff;
}

export const CM_NodeTypes: EnumDictionary<string, NodeType> = {
	'Addition': NodeType.ADDITION,
	'Deletion': NodeType.DELETION,
	'Substitution': NodeType.SUBSTITUTION,
	'Highlight': NodeType.HIGHLIGHT,
	'Comment': NodeType.COMMENT,
}



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
	[NodeType.COMMENT]:  ['{>>', '<<}'],
};
export const CM_Brackets: { [key: string]: string[] } = {
	'{++': ['++}'],
	'{--': ['--}'],
	'{~~': ['~>', '~~}'],
	'{==': ['==}'],
	'{>>': ['<<}'],
};

export function replaceBracket(content: string, type: NodeType) {
	return wrapBracket(unwrapBracket(content), type);
}

export function unwrapBracket(content: string) {
	return content.slice(3, -3);
}

export function unwrapBracket2(content: string, type: NodeType) {
	if (type === NodeType.SUBSTITUTION)
		return content.slice(3, -3).split('~>');
	return content.slice(3, -3);
}

export function wrapBracket(content: string, type: NodeType) {
	return CM_All_Brackets[type][0] + content + CM_All_Brackets[type].slice(1).join('');
}

export function addBracket(content: string, type: NodeType, left: boolean) {
	if (left)
		return '{' + CM_Syntax[type][0].repeat(2) + content;
	else
		return content + CM_Syntax[type][1].repeat(2) + '}';
}



export function indexOfRegex(string: string, regex: RegExp, fromIndex?: number){
	const str = fromIndex ? string.substring(fromIndex) : string;
	const match = str.match(regex);
	return match ? str.indexOf(match[0]) + (fromIndex ?? 0) : -1;
}

export function lastIndexOfRegex (string: string, regex: RegExp, fromIndex?: number){
	const str = fromIndex ? string.substring(0, fromIndex) : string;
	const match = str.match(regex);
	return match ? str.lastIndexOf(match[match.length-1]) : -1;
}

export function spliceString(str: string, remove: [number, number][]) {
	for (const [start, length] of remove.reverse())
		if (length < 0)
			str = str.slice(0, start - length) + str.slice(start - 2 * length);
		else
			str = str.slice(0, start) + str.slice(start + length);
	return str;
}


export const hSpace = /\S\n\v\f\r\u2028\u2029/;
