type EnumDictionary<T extends string | symbol | number, U> = {
	[K in T]: U;
};

export type STRING_SUGGESTION_TYPE = 'Addition' | 'Deletion' | 'Substitution' | 'Highlight' | 'Comment';

export type METADATA_TYPE = "author" | "date" | "completed" | "urgency" | "style";


// FIXME: Changed to string types, but beyond ideal --- far too much bloat
export enum SuggestionType {
	ADDITION = "addition",
	DELETION = "deletion",
	SUBSTITUTION = "substitution",
	HIGHLIGHT = "highlight",
	COMMENT	= "comment",
}

export type RangeType = SuggestionType | "";


export const CM_SuggestionTypes: EnumDictionary<string, SuggestionType> = {
	'Addition': SuggestionType.ADDITION,
	'Deletion': SuggestionType.DELETION,
	'Substitution': SuggestionType.SUBSTITUTION,
	'Highlight': SuggestionType.HIGHLIGHT,
	'Comment': SuggestionType.COMMENT,
};

export const CM_Syntax: EnumDictionary<SuggestionType, [string, string]> = {
	[SuggestionType.ADDITION]: ['+', '+'],
	[SuggestionType.DELETION]: ['-', '-'],
	[SuggestionType.SUBSTITUTION]: ['~', '~'],
	[SuggestionType.HIGHLIGHT]: ['=', '='],
	[SuggestionType.COMMENT]: ['>', '<'],
};

export const CM_All_Brackets: EnumDictionary<SuggestionType, string[]> = {
	[SuggestionType.ADDITION]: ['{++', '++}'],
	[SuggestionType.DELETION]: ['{--', '--}'],
	[SuggestionType.SUBSTITUTION]: ['{~~', '~>', '~~}'],
	[SuggestionType.HIGHLIGHT]: ['{==', '==}'],
	[SuggestionType.COMMENT]: ['{>>', '<<}'],
};

export const CM_Brackets: { [key: string]: string[] } = {
	'{++': ['++}'],
	'{--': ['--}'],
	'{~~': ['~>', '~~}'],
	'{==': ['==}'],
	'{>>': ['<<}'],
};

export const SUGGESTION_ICON_MAPPER = {
	[SuggestionType.ADDITION]: 'plus-circle',
	[SuggestionType.DELETION]: 'minus-square',
	[SuggestionType.SUBSTITUTION]: 'replace',
	[SuggestionType.HIGHLIGHT]: 'highlighter',
	[SuggestionType.COMMENT]: 'message-square',
};
