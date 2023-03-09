import type {PluginSettings} from "./types";

export const CM_Syntax: {[key: string]: [string, string]} = {
	"Addition": ["+", "+"],
	"Deletion": ["-", "-"],
	"Substitution": ["~", "~"],
	"Highlight": ["=", "="],
	"Comment": [">", "<"]
}

export const  CM_All_Brackets: {[key: string]: string[]} = {
	"Addition": ["{++", "++}"],
	"Deletion":["{--", "--}"],
	"Substitution": ["{~~", "~>", "~~}"],
	"Highlight": ["{==", "==}"],
	"Comment": ["{>>", "<<}"]
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
	return CM_All_Brackets[type][0] + content + CM_All_Brackets[type].slice(1).join('');
}

export function addBracket(content: string, type: string, left: boolean) {
	if (left)
		return '{' + CM_Syntax[type][0].repeat(2) + content;
	else
		return content + CM_Syntax[type][1].repeat(2) + '}';
}

export const DEFAULT_SETTINGS: PluginSettings = {
	suggestion_status: 0,
	editor_preview_button: true,
	editor_gutter: true,
	editor_styling: false,

	tag_completion: true,
	node_correcter: true,

	post_processor: true,
	live_preview: true
}