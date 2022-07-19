import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import type { EditorSelection, Range } from "@codemirror/state";
import { editorEditorField, editorViewField, editorLivePreviewField } from "obsidian";
import {criticmarkupLanguage} from 'lang-criticmarkup'
import type { TreeCursor } from "@lezer/common";

function selectionAndRangeOverlap(selection: EditorSelection, rangeFrom: number, rangeTo: number) {
    for (const range of selection.ranges) {
        if (range.from <= rangeTo && range.to >= rangeFrom) {
            return true;
        }
    }

    return false;
}

function makeHtml(name: string, text: string): HTMLElement {
    console.log("nodetype", name)
    // it's a Highlight
    if (name === "Substitution") {
        const regexStart = new RegExp("^(.+?)~>");
        let contentStart = regexStart.exec(text)
        const regexEnd = new RegExp("~>(.+?)$");
        let contentEnd = regexEnd.exec(text);
        let start, end;
        if (contentStart && contentEnd) {
            start = contentStart[1];
            end = contentEnd[1];
        }
        const separator = "🠚";
        let el = createSpan({
            cls: ["criticmarkup", "substitution", "substitution-all"]
        })
        console.log(el)
        el.createSpan({
            text: start,
            cls: ["criticmarkup", "substitution", "substitution-start"]
        })
        el.createSpan({
            text: separator,
            cls: ["criticmarkup", "substitution", "substitution-separator"]
        })
        el.createSpan({
            text: end,
            cls: ["criticmarkup", "substitution", "substitution-end"]
        })
        return el;
    } else {
        const cssClasses = ["criticmarkup"]
        switch(name){
            case "Deletion":
                cssClasses.push("deletion")
                break;
            case "Addition":
                cssClasses.push("addition")
                break;
            case "Comment":
                cssClasses.push("comment")
                break;
            case "Highlight":
                cssClasses.push("highlight")
                break;
            default:
                break;
        }
        console.log(cssClasses)
        let el = createSpan({
            text: text,
            cls: cssClasses
        })
        return el;
    }

}

class InlineWidget extends WidgetType {
    constructor(
        readonly name: string,
        readonly text: string,
        private view: EditorView,
    ) {
        super();
    }

    // Widgets only get updated when the raw query changes/the element gets focus and loses it
    // to prevent redraws when the editor updates.
    eq(other: InlineWidget): boolean {
        if (other.text === this.text) {
            return true;
        }
        return false;
    }

    toDOM(view: EditorView): HTMLElement {
        return makeHtml(this.name, this.text);
    }

    /* Make queries only editable when shift is pressed (or navigated inside with the keyboard
     * or the mouse is placed at the end, but that is always possible regardless of this method).
     * Mostly useful for links, and makes results selectable.
     * If the widgets should always be expandable, make this always return false.
     */
    ignoreEvent(event: MouseEvent | Event): boolean {
        // instanceof check does not work in pop-out windows, so check it like this
        if (event.type === 'mousedown') {
            const currentPos = this.view.posAtCoords({ x: (event as MouseEvent).x, y: (event as MouseEvent).y });
            if ((event as MouseEvent).shiftKey) {
                // Set the cursor after the element so that it doesn't select starting from the last cursor position.
                if (currentPos) {
                    //@ts-ignore
                    const { editor } = this.view.state.field(editorEditorField).state.field(editorViewField);
                    editor.setCursor(editor.offsetToPos(currentPos));
                }
                return false;
            }
        }
        return true;
    }
}

//function forNode (type: nodeType, from: number, to: number):  {}


function inlineRender(view: EditorView) {

    const widgets: Range<Decoration>[] = [];
    const selection = view.state.selection;

    // let waitNode: {cursor: TreeCursor, text: string} | null = null;
    //console.log(tree.iterate({enter(type, from, to, get() => {forNode(type, from, to)})}))
    //while (cursor.next()){
    // }
    for (const {from, to } of view.visibleRanges) {
        const text = view.state.doc.sliceString(from, to)
        const tree = criticmarkupLanguage.parser.parse(text)
        let cursor = tree.cursor()
        do {
            const start = cursor.from;
            const end = cursor.to;
            const name = cursor.name;
            console.log(cursor.name)
            // doesn't work
            if (name === "Criticmarkup" || name === "DivideSubs") continue;

            if (selectionAndRangeOverlap(selection, start, end)) continue;

            const content = view.state.doc.sliceString(start + 3, end - 3);
            console.log(content)
            console.log(`Node ${cursor.name} from ${cursor.from} to ${cursor.to}`);

            widgets.push(
                Decoration.replace({
                    //@ts-ignore
                    widget: new InlineWidget(name, content, view),
                    inclusive: false,
                    block: false,
                }).range(start, end)
            );
        } while (cursor.next());
    }

    return Decoration.set(widgets, true);
}

export function inlinePlugin(): ViewPlugin<any> {
    return ViewPlugin.fromClass(
        class {
            decorations: DecorationSet;

            constructor(view: EditorView) {
                this.decorations = Decoration.none;
                this.render(view);
            }

            render(view: EditorView) {
                this.decorations = inlineRender(view) ?? Decoration.none;
            }

            update(update: ViewUpdate) {
                // only activate in LP and not source mode
                //@ts-ignore
                if (!update.state.field(editorLivePreviewField)) {
                    this.decorations = Decoration.none;
                    return;
                }
                if (update.docChanged || update.viewportChanged || update.selectionSet) {
                    this.render(update.view)
                }
            }
        },
        { decorations: v => v.decorations }
    );
}
