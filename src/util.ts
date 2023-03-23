import type { CriticMarkupNode } from './types';

export function objectDifference(new_obj: any, old_obj: any): Partial<typeof new_obj> {
	const diff: Partial<typeof new_obj> = {};
	for (const key in new_obj) {
		if (new_obj[key] !== old_obj[key])
			diff[key] = new_obj[key];
	}
	return diff;
}

export const CM_Syntax: { [key: string]: [string, string] } = {
	'Addition': ['+', '+'],
	'Deletion': ['-', '-'],
	'Substitution': ['~', '~'],
	'Highlight': ['=', '='],
	'Comment': ['>', '<'],
};
export const CM_All_Brackets: { [key: string]: string[] } = {
	'Addition': ['{++', '++}'],
	'Deletion': ['{--', '--}'],
	'Substitution': ['{~~', '~>', '~~}'],
	'Highlight': ['{==', '==}'],
	'Comment': ['{>>', '<<}'],
};
export const CM_Brackets: { [key: string]: string[] } = {
	'{++': ['++}'],
	'{--': ['--}'],
	'{~~': ['~>', '~~}'],
	'{==': ['==}'],
	'{>>': ['<<}'],
};

export function replaceBracket(content: string, type: string) {
	return wrapBracket(unwrapBracket(content), type);
}

export function unwrapBracket(content: string) {
	return content.slice(3, -3);
}

export function unwrapBracket2(content: string, type: string) {
	if (type === 'Substitution')
		return content.slice(3, -3).split('~>');
	return content.slice(3, -3);
}

export function wrapBracket(content: string, type: string) {
	return CM_All_Brackets[type][0] + content + CM_All_Brackets[type].slice(1).join('');
}

export function addBracket(content: string, type: string, left: boolean) {
	if (left)
		return '{' + CM_Syntax[type][0].repeat(2) + content;
	else
		return content + CM_Syntax[type][1].repeat(2) + '}';
}


export function removeBrackets(str: string, nodes: CriticMarkupNode[], start: number) {
	let output = str.slice(0, nodes[0].from - start);
	for (const [idx, node] of nodes.entries()) {
		if (node.from - start < 0) continue;
		if (node.to - start >= str.length) break;
		// TODO: For unwrap: Substitution contents should be selected; e.g., if delete: select [2]?
		output += unwrapBracket(str.slice(node.from - start, node.to - start));
		if (idx !== nodes.length - 1)
			output += str.slice(node.to - start, nodes[idx + 1].from - start);
	}
	output += str.slice(nodes[nodes.length - 1].to - start);
	return output;
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
