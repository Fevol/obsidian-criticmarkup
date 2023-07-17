import type { MarkdownView } from 'obsidian';

import { criticmarkupLanguage } from '../parser';

import { CM_NodeTypes, CM_Syntax } from '../../util';

export function postProcess(el: HTMLElement, ctx: any, settings: any) {
	const tree = criticmarkupLanguage.parser.parse(el.innerHTML);

	let changes = [];
	let output = el.innerHTML;


	const cursor = tree.cursor();
	while (cursor.next()) {
		const start = cursor.from;
		const end = cursor.to;
		const name = cursor.name;

		if (name === '⚠') {
			changes.pop();
			break;
		} else if (name === 'MSub') continue;

		const is_rendered = output[start + 1] !== CM_Syntax[CM_NodeTypes[name]][0];

		if (name === 'Substitution') {
			cursor.firstChild();
			if (cursor.name !== 'MSub') continue;

			changes.push({
				start: start,
				end: end,
				name: name,
				middle: cursor.from,
				is_rendered: is_rendered,
			});
		} else {
			changes.push({
				start: start,
				end: end,
				name: name,
				is_rendered: is_rendered,
			});
		}
	}

	changes = changes.reverse();

	for (const change of changes) {
		let new_content = output.substring(change.start, change.end).slice(3, -3);

		let new_element = '';
		if (change.name === 'Addition') {
			if (!settings.preview_mode)
				new_element = `<span class='criticmarkup-preview criticmarkup-inline criticmarkup-addition'>${new_content}</span>`;
			else if (settings.preview_mode === 1)
				new_element = `<span class='criticmarkup-preview'>${new_content}</span>`;
			else
				new_element = `<span class='criticmarkup-preview'/>`;
		} else if (change.name === 'Deletion') {
			if (!settings.preview_mode)
				new_element = `<span class='criticmarkup-preview criticmarkup-inline criticmarkup-deletion'>${new_content}</span>`;
			else if (settings.preview_mode === 1)
				new_element = `<span class='criticmarkup-preview'/>`;
			else
				new_element = `<span class='criticmarkup-preview'>${new_content}</span>`;
		} else if (change.name === 'Substitution') {
			let middle = <number>change.middle - change.start + 2;
			if (change.is_rendered) {
				new_content = new_content.slice(3, -4);
				middle -= 3;
			}

			if (!settings.preview_mode)
				new_element = `<span class='criticmarkup-preview criticmarkup-inline criticmarkup-deletion'>${new_content.slice(0, middle - 5)}</span><span class='criticmarkup-inline criticmarkup-addition'>${new_content.substring(middle)}</span>`;
			else if (settings.preview_mode === 1)
				new_element = `<span class='criticmarkup-preview'>${new_content.substring(middle)}</span>`;
			else
				new_element = `<span class='criticmarkup-preview'>${new_content.substring(0, middle - 5)}</span>`;
		} else if (change.name === 'Highlight') {
			if (change.is_rendered)
				new_content = new_content.slice(4, -5);
			new_element = `<mark>${new_content}</mark>`;
		} else if (change.name === 'Comment') {
			if (change.is_rendered)
				new_content = new_content.slice(6, -6);
			new_element = `<span class='criticmarkup-comment'>${new_content}</span>`;
		}

		output = output.slice(0, change.start) + new_element + output.slice(change.end);
	}
	el.innerHTML = output;
}

export function postProcessorUpdate() {
	// Credits to depose/dp0z/@Profile8647 for finding this code
	for (const leaf of app.workspace.getLeavesOfType("markdown")) {
		const view = <MarkdownView>leaf.view;
		for (const section of view.previewMode.renderer.sections.filter(s => s.el.querySelector('span.criticmarkup-preview'))) {
			section.rendered = false;
			section.html = '';
		}
		view.previewMode.renderer.queueRender();
	}
}
