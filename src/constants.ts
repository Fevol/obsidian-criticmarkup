export const CM_Syntax: {[key: string]: [string, string]} = {
	"Addition": ["+", "+"],
	"Deletion": ["-", "-"],
	"Substitution": ["~", "~"],
	"Highlight": ["=", "="],
	"Comment": [">", "<"]
}

export const CM_Brackets: {[key: string]: string[]} = {
	"{++": ["++}"],
	"{--": ["--}"],
	"{~~": ["~>", "~~}"],
	"{==": ["==}"],
	"{>>": ["<<}"]
}


export function replaceBracket(content: string, type: string) {
	return wrapBracket(unwrapBracket(content), type);
}

export function unwrapBracket(content: string) {
	return content.slice(3, -3);
}

export function wrapBracket(content: string, type: string) {
	return '{' + CM_Syntax[type][0].repeat(2) + content + CM_Syntax[type][1].repeat(2) + '}';
}

export function addBracket(content: string, type: string, left: boolean) {
	if (left)
		return '{' + CM_Syntax[type][0].repeat(2) + content;
	else
		return content + CM_Syntax[type][1].repeat(2) + '}';
}