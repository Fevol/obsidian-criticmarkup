import { MarkdownView } from 'obsidian';
import {EditorSelection} from "@codemirror/state";


export function codeBlockPostProcessorUpdate(language: string) {
	for (const leaf of app.workspace.getLeavesOfType("markdown")) {
		const view = <MarkdownView>leaf.view;
		if (view.editor.cm) {
			const widgets = view.editor.cm.viewportLineBlocks.filter((block) => block.widget && block.widget.lang === language);
			const original_selection = view.editor.cm.state.selection;
			view.editor.cm.dispatch({
				selection: EditorSelection.create(widgets.map((block) => EditorSelection.range(block.from, block.to))),
				scrollIntoView: false,
			})
			view.editor.cm.dispatch({
				selection: original_selection,
				scrollIntoView: false,
			})
		}
	}
}


export function postProcessorUpdate() {
	// Credits to depose/dp0z/@Profile8647 for finding this code
	for (const leaf of app.workspace.getLeavesOfType("markdown")) {
		const view = <MarkdownView>leaf.view;
		for (const section of view.previewMode.renderer.sections.filter(s => s.el.querySelector('.criticmarkup-preview'))) {
			section.rendered = false;
			section.html = '';
		}
		view.previewMode.renderer.queueRender();
	}
}

export function postProcessorRerender() {
	for (const leaf of app.workspace.getLeavesOfType("markdown"))
		(leaf.view as MarkdownView).previewMode.rerender(true)
}
