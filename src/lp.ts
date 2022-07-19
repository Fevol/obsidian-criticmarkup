import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import type { EditorSelection, Range } from "@codemirror/state";
import { editorEditorField, editorViewField, editorLivePreviewField } from "obsidian";
import {criticmarkupLanguage} from 'lang-criticmarkup'
import type { TreeCursor } from "@lezer/common";
import {create} from "domain";

function selectionAndRangeOverlap(selection: EditorSelection, rangeFrom: number, rangeTo: number) {
    for (const range of selection.ranges) {
        if (range.from <= rangeTo && range.to >= rangeFrom) {
            return true;
        }
    }

    return false;
}


class InlineWidget extends WidgetType {
    constructor(
        readonly name: string,
        readonly text: string,
        private view: EditorView,
        private marker: boolean = false
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
        if (!this.marker) {
            return createSpan({cls: "criticmarkup-marker"})
        } else {
            return createSpan({
                cls: ["criticmarkup-marker", "dividesubs"],
                text: "🠚"
            })
        }
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


function inlineRender(view: EditorView) {

    const widgets: Range<Decoration>[] = [];
    const selection = view.state.selection;

    for (const {from, to } of view.visibleRanges) {
        const text = view.state.doc.sliceString(from, to)
        const tree = criticmarkupLanguage.parser.parse(text)
        let cursor = tree.cursor()
        do {
            const start = cursor.from;
            const end = cursor.to;
            const name = cursor.name;
            // doesn't work
            if (name === "Criticmarkup") continue;

            if (selectionAndRangeOverlap(selection, start, end)) continue;

            const content = view.state.doc.sliceString(start + 3, end - 3);

            if (name === "DivideSubs") {
                widgets.push(
                    Decoration.replace({
                        widget: new InlineWidget(name, content, view, true),
                        inclusive: false,
                        block: false,
                    }).range(start, end))
            } else {
                widgets.push(
                    Decoration.replace({
                        widget: new InlineWidget(name, content, view),
                        inclusive: false,
                        block: false,
                    }).range(start, start+3))
                widgets.push(
                    Decoration.replace({
                        widget: new InlineWidget(name, content, view),
                        inclusive: false,
                        block: false,
                    }).range(end-3, end))


                let cssClass = "";
                switch(name){
                    case "Deletion":
                        cssClass = "deletion";
                        break;
                    case "Addition":
                        cssClass = "addition";
                        break;
                    case "Comment":
                        cssClass = "comment";
                        break;
                    case "Highlight":
                        cssClass = "highlight";
                        break;
                    case "Substitution":
                        cssClass = "substitution";
                        break;
                    default:
                        break;
                }
                if (start+3 !== end-3) {
                    widgets.push(
                        Decoration.mark({
                            class: `criticmarkup-${cssClass}`,
                            attributes: {"data-contents": "string"},
                        }).range(start+3, end-3)
                    );
                }
            }

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
