import { Command, Plugin, SettingTab } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';


interface AppVaultConfig {
	accentColor: '' | string;
	alwaysUpdateLinks?: false | boolean;
	attachmentFolderPath?: '/' | string;
	autoConvertHtml?: true | boolean;
	autoPairBrackets?: true | boolean;
	autoPairMarkdown?: true | boolean;
	baseFontSize?: 16 | number;
	baseFontSizeAction?: true | boolean;
	communityPluginSortOrder: 'download' | 'update' | 'release' | 'alphabetical';
	communityThemeSortOrder: 'download' | 'update' | 'release' | 'alphabetical';
	// Name/ID of community theme being used, "" is default theme
	cssTheme?: '' | string;
	defaultViewMode?: 'source' | 'preview';
	emacsyKeys?: true | boolean;
	enabledCssSnippets?: string[];
	fileSortOrder?: 'alphabetical';
	foldHeading?: true | boolean;
	foldIndent?: true | boolean;
	hotkeys?: { [key: string]: string };
	interfaceFontFamily?: '' | string;
	legacyEditor?: false | boolean;
	livePreview?: true | boolean;
	mobilePullAction?: 'command-palette:open' | string;
	mobileToolbarCommands?: string[];
	monospaceFontFamily?: '' | string;
	nativeMenus?: null | boolean;
	newFileFolderPath?: '/' | string;
	newFileLocation?: 'root' | 'current';
	pdfExportSettings?: {
		pageSize: 'letter' | string;
		landscape: false | boolean;
		margin: '0' | string;
		downscalePercent: 100 | number;
	};
	newLinkFormat?: 'shortest' | 'relative' | 'absolute';
	promptDelete?: true | boolean;
	readableLineLength?: true | boolean;
	rightToLeft?: false | boolean;
	showFrontmatter?: false | boolean;
	showIndentGuide?: true | boolean;
	showInlineTitle?: true | boolean;
	showLineNumber?: false | boolean;
	showUnsupportedFiles?: false | boolean;
	showViewHeader?: false | boolean;
	smartIndentList?: true | boolean;
	spellcheck?: false | boolean;
	spellcheckDictionary?: [] | string[];
	spellcheckLanguages?: null | string[];
	strictLineBreaks?: false | boolean;
	tabSize?: 4 | number;
	textFontFamily?: '' | string;
	// "moonstone" is light theme, "obsidian" is dark theme
	theme?: 'moonstone' | 'obsidian';
	translucency?: false | boolean;
	trashOption?: 'system' | 'local' | 'none';
	useMarkdownLinks?: false | boolean;
	useTab?: true | boolean;
	userIgnoreFilters?: null | string[];
	vimMode?: false | boolean;
}

interface PluginManifest {
	author?: string;
	authorUrl?: string;
	description?: string;
	dir?: string;
	id?: string;
	isDesktopOnly?: boolean;
	minAppVersion?: string;
	name?: string;
	version?: string;
}

interface SettingTabI extends SettingTab {
	containerEl: HTMLElement;
	id: string;
	name: string;
	navEl: HTMLElement;
	plugin?: Plugin;
}

interface RendererSection {
	el: HTMLElement;
	html: string;
	rendered: boolean;
}

interface ReadViewRenderer {
	addBottomPadding: boolean;
	lastRender: number;
	lastScroll: number;
	lastText: string;
	previewEl: HTMLElement;
	pusherEl: HTMLElement;
	clear: () => void;
	queueRender: () => void;
	parseSync: () => void;
	parseAsync: () => void;
	set: (text: string) => void;
	text: string;
	sections: RendererSection[];
	asyncSections: any[];
	recycledSections: any[];
	rendered: any[];

}

interface CursorLocation {
	ch: number,
	line: number
}



interface CMState extends EditorState {
	vim: {
		inputState: {
			changeQueue: null,
			keyBuffer: [],
			motion: null,
			motionArgs: null,
			motionRepeat: [],
			operator: null,
			operatorArgs: null,
			prefixRepeat: [],
			registerName: null,
		},
		insertMode: false,
		insertModeRepeat: undefined,
		lastEditActionCommand: undefined,
		lastEditInputState: undefined,
		lastHPos: number,
		lastHSPos: number,
		lastMotion: {
			name?: string,
		},
		lastPastedText: null,
		lastSelection: null,
	},
	vimPlugin: {
		lastKeydown: string,
	}
}

interface CMView extends EditorView {
	state: CMState;
}


interface EditorViewI extends EditorView {
	cm?: CMView;
}


declare module 'obsidian' {
	interface App {
		account: {
			company: string;
			email: string;
			expiry: number;
			key: string;
			keyValidation: string;
			license: string;
			name: string;
			seats: number;
			token: string;
		};
		appId?: string;
		commands: {
			commands: Record<string, Command>;
			editorCommands: Record<string, Command>;
		};
		customCss: {
			enabledSnippets: Set<string>;
			oldThemes: string[];
			snippets: string[];
			theme: string;
			themes: Record<string, PluginManifest>
		};
		isMobile: boolean;
		plugins: {
			enabledPlugins: Set<string>;
			manifests: Map<string, PluginManifest>;
			plugins: { [key: string]: Plugin };
			updates: Map<string, string>;
			uninstallPlugin(...args): void;
		};
		setting: {
			activateTab: string;
			dimBackground: boolean;
			lastTabId: string;
			open: () => void;
			openTabById: (id: string) => void;
			// Obsidian Options
			settingTabs: SettingTabI[];
			// Obsidian core + community plugins
			pluginTabs: SettingTabI[];
		};

		vault: Vault;
		workspace: Workspace;

		loadLocalStorage(key: string): any;

		saveLocalStorage(key: string, value: any): void;
	}

	interface View {
		headerEl: HTMLElement;
		titleEl: HTMLElement;
	}

	interface WorkspaceLeaf {
		id?: string;

		tabHeaderEl: HTMLElement;
		tabHeaderInnerIconEl: HTMLElement;
		tabHeaderInnerTitleEl: HTMLElement;
	}

	interface Vault {
		on(name: 'config-changed', callback: () => void, ctx?: any): EventRef;

		config: AppVaultConfig;
		getConfig: (key: string) => any;
		setConfig: (key: string, value: any) => void;
	}

	interface Menu {
		dom: HTMLElement;
		items: MenuItem[];
		onMouseOver: (evt: MouseEvent) => void;
		hide: () => void;
	}

	interface MenuItem {
		callback: () => void;
		dom: HTMLElement;
		setSubmenu: () => Menu;
		onClick: (evt: MouseEvent) => void;
		disabled: boolean;
	}

	interface Editor {
		cm: EditorViewI;
	}

	interface MarkdownPreviewView {
		renderer: ReadViewRenderer;
	}

}

