type EnumDictionary<T extends string | symbol | number, U> = {
	[K in T]: U;
};

export type StringSuggestionType = 'Addition' | 'Deletion' | 'Substitution' | 'Highlight' | 'Comment';

export enum SuggestionType {
	ADDITION,
	DELETION,
	SUBSTITUTION,
	HIGHLIGHT,
	COMMENT,
}

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

/**
 * How to move through a suggestion range when moving the cursor
 */
export enum RANGE_CURSOR_MOVEMENT_OPTION {
	// Treat all characters as normal
	UNCHANGED,

	// Ignores all bracket characters, but NOT metadata
	IGNORE_BRACKET,

	// Ignores all bracket characters AND metadata
	IGNORE_METADATA,

	// Ignores the entire suggestion range
	IGNORE_COMPLETELY,
}

/**
 * How to move through a range when moving through a bracket
 */
export enum RANGE_BRACKET_MOVEMENT_OPTION {
	// Move as normal (move through a bracket)
	UNCHANGED,

	// When *leaving* a bracket, stay inside the range if cursor cannot move anymore
	STAY_INSIDE,

	// When *reaching* a bracket, stay outside, even if cursor can move further
	STAY_OUTSIDE,
}
