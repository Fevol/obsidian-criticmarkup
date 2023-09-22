import { MarkdownView } from 'obsidian';

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
