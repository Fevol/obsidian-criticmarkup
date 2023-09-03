import type { MarkdownPostProcessorContext, MarkdownView } from 'obsidian';
import { decodeHTML, DecodingMode } from 'entities';

import { criticmarkupLanguage } from '../parser';

import type { PluginSettings } from '../../types';
import { NodeType } from '../../types';
import type { CriticMarkupNode } from '../criticmarkup-nodes';
import { NODE_PROTOTYPE_MAPPER, SubstitutionNode } from '../criticmarkup-nodes';
import { CM_All_Brackets } from '../../util';
import { nodesInSelection } from '../editor-util';


// FIXME: Issue: MarkdownRenderer.render(...) on custom elements does not provide global context?
export async function postProcess(el: HTMLElement, ctx: MarkdownPostProcessorContext, settings: PluginSettings) {
	let nodes_in_range: CriticMarkupNode[] | null = null;
	let start_char: number | null = null, end_char: number | null = null;

	// Undo HTML encoding of specific characters
	let element_contents = decodeHTML(el.innerHTML, DecodingMode.Strict);

	if (ctx) {
		const lines = ctx.getSectionInfo(el);
		if (lines) {
			const all_nodes = nodesInSelection(criticmarkupLanguage.parser.parse(lines.text));

			// We have access to the endlines, so we can determine which node(s) the element belongs to
			const endlines = [...lines.text.matchAll(/\n/g)].map((m) => m.index!);

			start_char = !lines.lineStart ? 0 : endlines[lines.lineStart - 1] + 1;
			end_char = endlines[lines.lineEnd] ?? lines.text.length;

			nodes_in_range = all_nodes.nodes_in_range(start_char, end_char, true);

			if (!nodes_in_range.length) return;

			if (nodes_in_range.length === 1) {
				const node = nodes_in_range[0];
				let in_range = false;
				let left: boolean | null = null;
				if (node.type === NodeType.SUBSTITUTION) {
					// Determines whether range belongs to the left or right part of the substitution
					if (node.part_encloses_range(start_char, end_char, true) && (in_range = true, left = true)) {}
					else if (node.part_encloses_range(start_char, end_char, false) && (in_range = true, left = false)) {}
				} else {
					in_range = node.encloses_range(start_char, end_char);
				}

				if (in_range) {
					// TEMPORARY: Remove the ~> from the element contents
					if (node.type === NodeType.SUBSTITUTION)
						element_contents = element_contents.replace(/~>/g, "");

					const left_unwrap = start_char === node.from;
					const right_unwrap = end_char === node.to;


					const right_bracket = CM_All_Brackets[node.type].at(-1)!;
					const left_bracket = CM_All_Brackets[node.type][0];

					// Remove last occurence of right bracket
					if (right_unwrap) {
						const last_bracket = element_contents.lastIndexOf(right_bracket);
						element_contents = element_contents.substring(0, last_bracket) + element_contents.substring(last_bracket + 3);
					}

					if (left_unwrap) {
						const first_bracket = element_contents.indexOf(left_bracket);
						element_contents = element_contents.substring(0, first_bracket) + element_contents.substring(first_bracket + 3);
					}



					// FIXME: Unwrap is still the issue: find when to remove brackets correctly
					el.innerHTML = node.postprocess(element_contents, false, settings.preview_mode, "div", left);

					return;
				}
			}
		}
	}

	// If code lands here, the element includes a transition of a node (either in/out of a node, or passing middle arrow)

	// Revert markdown rendering of stricken through text and other incorrectly applied markup (that normally would be rendered as <del>...</del>)
	element_contents = element_contents.replaceAll(/{<del>|{<\/del>/g, "{~~")
										.replaceAll(/<del>}|<\/del>}/g, "~~}")
										.replaceAll(/{<mark>|{<\/mark>/g, "{==")
										.replaceAll(/<mark>}|<\/mark>}/g, "==}")
										.replaceAll(/{=<mark>=}|{=<\/mark>=}/g, "{====}")

	const tree = criticmarkupLanguage.parser.parse(element_contents);

	// Part of the block is one or more CriticMarkup nodes
	const element_nodes = nodesInSelection(tree).nodes;

	if (!element_nodes.length && !nodes_in_range?.length) return;

	let previous_start = 0;
	let new_element = "";

	// Case where node was opened in earlier block, and closed in current block
	// Parser on element contents will not register the end bracket as a valid node,
	// so we need to manually catch it
	let missing_node: CriticMarkupNode | null = null;
	let left_outside: boolean | null = null;
	let right_outside: boolean | null = null;
	if (nodes_in_range !== null && element_nodes.length !== nodes_in_range.length) {
		// ..._outside means that node in given direction was not completed with bracket within the block
		left_outside = start_char! > nodes_in_range[0].from;
		right_outside = end_char! < nodes_in_range.at(-1)!.to;
		missing_node = right_outside ? nodes_in_range.at(-1)! : nodes_in_range[0];
	}

	// This is a special case where you have A ~> B not surrounded by brackets
	if (missing_node && left_outside && right_outside && missing_node.type === NodeType.SUBSTITUTION) {
		const missing_node_middle = element_contents.indexOf(CM_All_Brackets[NodeType.SUBSTITUTION][1]);
		const TempNode = new SubstitutionNode(-Infinity, missing_node_middle, Infinity);
		new_element += TempNode.postprocess(element_contents, true, settings.preview_mode, "span")
		el.innerHTML = new_element;
		return;
	}

	if (missing_node && !right_outside) {
		const missing_node_end = element_contents.indexOf(CM_All_Brackets[missing_node.type].at(-1)!) + 3;

		let TempNode: CriticMarkupNode;
		if (missing_node.type === NodeType.SUBSTITUTION) {
			const missing_node_middle = element_contents.indexOf(CM_All_Brackets[NodeType.SUBSTITUTION][1]);
			TempNode = new SubstitutionNode(-Infinity, missing_node_middle === -1 ? -Infinity : missing_node_middle, missing_node_end);
		} else
			TempNode = new NODE_PROTOTYPE_MAPPER[missing_node.type](-Infinity, missing_node_end);
		new_element += TempNode.postprocess(element_contents, true, settings.preview_mode, "span");
		previous_start = TempNode.to;
	}

	for (const node of element_nodes) {
		new_element += element_contents.slice(previous_start, node.from) +
						node.postprocess(element_contents, true, settings.preview_mode, "span");
		previous_start = node.to;
	}

	if (missing_node && right_outside) {
		const missing_node_start = element_contents.lastIndexOf(CM_All_Brackets[missing_node.type][0]);

		let TempNode: CriticMarkupNode;
		if (missing_node.type === NodeType.SUBSTITUTION)
			TempNode = new SubstitutionNode(0, Infinity, Infinity);
		else
			TempNode = new NODE_PROTOTYPE_MAPPER[missing_node.type](0, Infinity);
		new_element += element_contents.slice(previous_start, missing_node_start) +
			TempNode.postprocess(element_contents.slice(missing_node_start, -4), true, settings.preview_mode, "span");
		previous_start = Infinity;
	}
	new_element += element_contents.slice(previous_start);

	el.innerHTML = new_element;
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
