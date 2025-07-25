import { EditorSelection } from "@codemirror/state";
import { App, MarkdownView } from "obsidian";
import type {BlockInfo} from "@codemirror/view";

export function codeBlockPostProcessorUpdate(app: App, language: string) {
	for (const leaf of app.workspace.getLeavesOfType("markdown")) {
		if (leaf.view instanceof MarkdownView) {
			const { view } = leaf;
			if (view.editor.cm) {
				const widgets = view.editor.cm.viewportLineBlocks.filter((block: BlockInfo) =>
					block.widget && block.widget.lang === language
				);
				const original_selection = view.editor.cm.state.selection;
				view.editor.cm.dispatch({
					selection: EditorSelection.create(widgets.map((block: BlockInfo) => EditorSelection.range(block.from, block.to))),
					scrollIntoView: false,
				});
				view.editor.cm.dispatch({
					selection: original_selection,
					scrollIntoView: false,
				});
			}
		}
	}
}

export function postProcessorUpdate(app: App) {
	// Credits to depose/dp0z/@Profile8647 for finding this code
	for (const leaf of app.workspace.getLeavesOfType("markdown")) {
		if (leaf.view instanceof MarkdownView) {
			for (
				const section of leaf.view.previewMode.renderer.sections.filter(s => s.el.querySelector(".cmtr-preview"))
				) {
				section.rendered = false;
				section.html = "";
			}
			leaf.view.previewMode.renderer.queueRender();
		}
	}
}

export function postProcessorRerender(app: App) {
	for (const leaf of app.workspace.getLeavesOfType("markdown"))
		if (leaf.view instanceof MarkdownView) {
			leaf.view.previewMode.rerender(true);
		}
}
