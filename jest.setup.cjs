// Minimal stubs for the Obsidian runtime globals that some modules touch at import time
// (jsdom provides the DOM, but not Obsidian's `app`/`activeWindow`/`activeDocument`).
//
// In particular, `src/ui/embeddable-editor.ts` resolves a base class at module-evaluation
// time via `app.embedRegistry.embedByExtension.md(...)`, so importing anything in that graph
// (e.g. the range parser) requires a functional-enough `embedRegistry` to exist up front.

// A throwaway prototype chain so resolveEditorPrototype() can derive an extendable base class:
//   getPrototypeOf(getPrototypeOf(editMode)).constructor  ->  EditorBase
class EditorBase {}
class ScrollableEditor extends EditorBase {}

const makeWidgetEditor = () => ({
	editable: false,
	editMode: new ScrollableEditor(),
	showEditor() {},
	unload() {},
});

globalThis.app = {
	workspace: { activeEditor: null },
	embedRegistry: {
		embedByExtension: {
			md: () => makeWidgetEditor(),
		},
	},
};

globalThis.activeWindow = globalThis.window;
globalThis.activeDocument = globalThis.document;

// Obsidian augments the global scope and Element.prototype with DOM helpers. Provide the
// minimal subset that modules use at import / render time.
function applyElInfo(el, o) {
	if (o == null) return el;
	if (typeof o === "string") {
		el.className = o;
		return el;
	}
	if (o.cls) el.className = Array.isArray(o.cls) ? o.cls.join(" ") : o.cls;
	if (o.text != null) el.textContent = o.text;
	if (o.attr) for (const k in o.attr) el.setAttribute(k, o.attr[k]);
	if (o.href != null) el.setAttribute("href", o.href);
	if (o.title != null) el.title = o.title;
	return el;
}

function createEl(tag, o, callback) {
	const el = document.createElement(tag);
	applyElInfo(el, o);
	if (callback) callback(el);
	return el;
}

globalThis.createEl = createEl;
globalThis.createDiv = (o, callback) => createEl("div", o, callback);
globalThis.createSpan = (o, callback) => createEl("span", o, callback);
globalThis.createFragment = (callback) => {
	const fragment = document.createDocumentFragment();
	if (callback) callback(fragment);
	return fragment;
};

const elProto = globalThis.HTMLElement && globalThis.HTMLElement.prototype;
if (elProto && !elProto.createEl) {
	elProto.createEl = function(tag, o, callback) {
		const el = createEl(tag, o, callback);
		this.appendChild(el);
		return el;
	};
	elProto.createDiv = function(o, callback) { return this.createEl("div", o, callback); };
	elProto.createSpan = function(o, callback) { return this.createEl("span", o, callback); };
	elProto.empty = function() { while (this.firstChild) this.removeChild(this.firstChild); return this; };
	elProto.setText = function(text) { this.textContent = text; return this; };
	elProto.addClass = function(...cls) { this.classList.add(...cls); return this; };
	elProto.removeClass = function(...cls) { this.classList.remove(...cls); return this; };
	elProto.toggleClass = function(cls, value) { this.classList.toggle(cls, value); return this; };
}
