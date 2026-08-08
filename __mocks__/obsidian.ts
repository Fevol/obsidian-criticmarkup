import { StateField } from "@codemirror/state";

export const moment = {
	locale: () => {
		return "en";
	},
};

// The `obsidian` package ships types only (no JS), so these runtime values must be stubbed for
// tests. Behaviour is intentionally minimal — just enough to import the module graph and run.

export class Component {
	registerEvent() {}
	addChild<T>(c: T): T { return c; }
	removeChild<T>(c: T): T { return c; }
	register() {}
	load() {}
	onload() {}
	unload() {}
	onunload() {}
}

export class Events {
	on() { return {} as any; }
	off() {}
	offref() {}
	trigger() {}
}

export class Plugin extends Component {}
export class PluginSettingTab {}
export class Modal {}
export class ItemView {}
export class MarkdownView {}
export class WorkspaceLeaf {}
export class TFile {}

export class MenuItem {
	setTitle() { return this; }
	setIcon() { return this; }
	setSection() { return this; }
	setSubmenu() { return new Menu(); }
	setChecked() { return this; }
	setDisabled() { return this; }
	onClick() { return this; }
}

export class Menu {
	addItem(cb: (item: MenuItem) => void) { cb(new MenuItem()); return this; }
	addSeparator() { return this; }
	showAtPosition() { return this; }
	showAtMouseEvent() { return this; }
	hide() { return this; }
}

export class Notice {
	constructor(_message?: string | DocumentFragment, _timeout?: number) {}
	setMessage() { return this; }
	hide() {}
}

export class Scope {
	register() { return {} as any; }
	unregister() {}
}

export class MarkdownRenderer extends Component {
	static render() { return Promise.resolve(); }
	static renderMarkdown() { return Promise.resolve(); }
}

export const Platform = {
	isMobile: false,
	isDesktop: true,
	isMacOS: false,
	isWin: false,
	isLinux: false,
};

export const apiVersion = "1.12.3";

export function debounce<T extends (...args: any[]) => any>(fn: T): T { return fn; }
export function setIcon() {}
export function getIcon() { return null; }
export function prepareSimpleSearch() { return () => null; }
export function sanitizeHTMLToDom(html: string) {
	const fragment = document.createDocumentFragment();
	const div = document.createElement("div");
	div.innerHTML = html;
	while (div.firstChild) fragment.appendChild(div.firstChild);
	return fragment;
}

// CodeMirror state fields that Obsidian injects into its editors.
export const editorInfoField = StateField.define<any>({
	create: () => ({ app: globalThis.app, file: null }),
	update: (value) => value,
});
export const editorEditorField = StateField.define<any>({
	create: () => ({}),
	update: (value) => value,
});
export const editorLivePreviewField = StateField.define<boolean>({
	create: () => false,
	update: (value) => value,
});

/** @public */
export interface RequestUrlParam {
	/** @public */
	url: string;
	/** @public */
	method?: string;
	/** @public */
	contentType?: string;
	/** @public */
	body?: string | ArrayBuffer;
	/** @public */
	headers?: Record<string, string>;
	/** @public */
	throw?: boolean;
}

/** @public */
export interface RequestUrlResponse {
	/** @public */
	status: number;
	/** @public */
	headers: Record<string, string>;
	/** @public */
	arrayBuffer: ArrayBuffer;
	/** @public */
	json: unknown;
	/** @public */
	text: string;
}

export async function requestUrl(request: RequestUrlParam) {
	const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
    });
    if (response.status >= 400 && request.throw)
        throw new Error(`Request failed, ${response.status}`);
    // Turn response headers into Record<string, string> object
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
        headers[key] = value;
    });
    const arraybuffer = await response.arrayBuffer();
    const text = arraybuffer ? new TextDecoder().decode(arraybuffer) : "";
    const json = text ? JSON.parse(text) : {};
    return {
		status: response.status,
		headers: headers,
		arrayBuffer: arraybuffer,
		json: json,
		text: text,
	} satisfies RequestUrlResponse;
}
