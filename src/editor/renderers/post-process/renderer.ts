import { type MarkdownPostProcessorContext } from 'obsidian';
import { decodeHTML, DecodingMode } from 'entities';

import { type PluginSettings } from '../../../types';

import {
	NodeType, type CriticMarkupNode, SubstitutionNode,
	NODE_PROTOTYPE_MAPPER, CM_All_Brackets,
	getNodesInText,
} from '../../base';

export async function postProcess(el: HTMLElement, ctx: MarkdownPostProcessorContext, settings: PluginSettings) {
	let nodes_in_range: CriticMarkupNode[] | null = null;
	let start_char: number | null = null, end_char: number | null = null;

	// Undo HTML encoding of specific characters
	let element_contents = decodeHTML(el.innerHTML, DecodingMode.Strict);

	if (ctx) {
		const lines = ctx.getSectionInfo(el);
		if (lines) {
			const all_nodes = getNodesInText(lines.text);

			// We have access to the endlines, so we can determine which node(s) the element belongs to
			const endlines = [...lines.text.matchAll(/\n/g)].map((m) => m.index!);

			start_char = !lines.lineStart ? 0 : endlines[lines.lineStart - 1] + 1;
			end_char = endlines[lines.lineEnd] ?? lines.text.length;

			nodes_in_range = all_nodes.nodes_in_range(start_char, end_char, true);

			if (!nodes_in_range.length) return;

			// Potential check: element is entirely enclosed by a single node
			if (nodes_in_range.length === 1) {
				const node = nodes_in_range[0];
				let in_range = false;
				let left: boolean | null = null;
				if (node.type === NodeType.SUBSTITUTION) {
					// Determines whether range belongs to the left or right part of the substitution
					if (node.part_encloses_range(start_char, end_char, true) && (in_range = true, left = true)) {
					} else if (node.part_encloses_range(start_char, end_char, false) && (in_range = true, left = false)) {
					}
				} else {
					in_range = node.encloses_range(start_char, end_char);
				}

				if (in_range) {
					// TEMPORARY: Remove the ~> from the element contents
					if (node.type === NodeType.SUBSTITUTION)
						element_contents = element_contents.replace(/~>/g, '');

					const left_unwrap = start_char === node.from;
					const right_unwrap = end_char === node.to;


					// Remove last occurrence of right bracket
					if (right_unwrap) {
						const last_bracket = element_contents.lastIndexOf(CM_All_Brackets[node.type].at(-1)!);
						element_contents = element_contents.substring(0, last_bracket) + element_contents.substring(last_bracket + 3);
					}

					if (left_unwrap) {
						const first_bracket = element_contents.indexOf(CM_All_Brackets[node.type][0]);
						element_contents = element_contents.substring(0, first_bracket) + element_contents.substring(first_bracket + 3);
					}


					// FIXME: Unwrap is still the issue: find when to remove brackets correctly
					el.innerHTML = node.postprocess(false, settings.preview_mode, 'div', left, element_contents);

					return;
				}
			}
		}
	}

	// If code lands here, the element includes a transition of a node (either in/out of a node, or passing middle arrow)

	// Revert markdown rendering of stricken through text and other incorrectly applied markup (that normally would be rendered as <del>...</del>)
	element_contents = element_contents.replaceAll(/{<del>|{<\/del>/g, '{~~')
		.replaceAll(/<del>}|<\/del>}/g, '~~}')
		.replaceAll(/{<mark>|{<\/mark>/g, '{==')
		.replaceAll(/<mark>}|<\/mark>}/g, '==}')
		.replaceAll(/{=<mark>=}|{=<\/mark>=}/g, '{====}');

	// Part of the block is one or more CriticMarkup nodes

	const element_nodes = getNodesInText(element_contents).nodes;

	// If markup exists in heading or similar, the text might get duplicated into a data-... field
	// Fix: if two duplicate nodes adjacent to each other, remove the former
	for (let i = 0; i < element_nodes.length - 1; i++) {
		const node = element_nodes[i], next_node = element_nodes[i + 1];
		if (node.equals(next_node)) {
			element_nodes.splice(i, 1);
			i--;
		}
	}


	// No node syntax found in element, and no context was provided to determine whether the element is even part of a noe
	if (!element_nodes.length && !nodes_in_range?.length) return;

	let previous_start = 0, new_element = '';

	// Case where node was opened in earlier block, and closed in current block
	// Parser on element contents will not register the end bracket as a valid node, so we need to manually construct the node
	let missing_node: CriticMarkupNode | null = null;
	let left_outside: boolean | null = null;
	let right_outside: boolean | null = null;
	if (nodes_in_range !== null && element_nodes.length !== nodes_in_range.length) {
		// ..._outside means that node in given direction was not completed with bracket within the block
		left_outside = start_char! > nodes_in_range[0].from;
		right_outside = end_char! < nodes_in_range.at(-1)!.to;
		missing_node = right_outside ? nodes_in_range.at(-1)! : nodes_in_range[0];
	}

	// CASE 1: A ~> B SUBSTITUTION where {~~ and ~~} exist in different blocks
	if (missing_node && left_outside && right_outside && missing_node.type === NodeType.SUBSTITUTION) {
		const missing_node_middle = element_contents.indexOf(CM_All_Brackets[NodeType.SUBSTITUTION][1]);
		const TempNode = new SubstitutionNode(-Infinity, missing_node_middle, Infinity, element_contents);
		new_element += TempNode.postprocess(true, settings.preview_mode, 'span');
		el.innerHTML = new_element;
		return;
	}

	// CASE 2: Node for which the start bracket exists in a previous block
	if (missing_node && !right_outside) {
		const missing_node_end = element_contents.indexOf(CM_All_Brackets[missing_node.type].at(-1)!) + 3;

		let TempNode: CriticMarkupNode;
		if (missing_node.type === NodeType.SUBSTITUTION) {
			const missing_node_middle = element_contents.indexOf(CM_All_Brackets[NodeType.SUBSTITUTION][1]);
			TempNode = new SubstitutionNode(-Infinity, missing_node_middle === -1 ? -Infinity : missing_node_middle, missing_node_end, element_contents);
		} else
			TempNode = new NODE_PROTOTYPE_MAPPER[missing_node.type](-Infinity, missing_node_end, element_contents);
		new_element += TempNode.postprocess(true, settings.preview_mode, 'span');
		previous_start = TempNode.to;
	}

	// DEFAULT: Nodes get processed as normal (nodes which exists completely within the block)
	for (const node of element_nodes) {
		new_element += element_contents.slice(previous_start, node.from) +
			node.postprocess(true, settings.preview_mode, 'span');
		previous_start = node.to;
	}

	// CASE 3: Node for which the end bracket exists in a later block
	if (missing_node && right_outside) {
		const missing_node_start = element_contents.lastIndexOf(CM_All_Brackets[missing_node.type][0]);

		let TempNode: CriticMarkupNode;
		if (missing_node.type === NodeType.SUBSTITUTION)
			TempNode = new SubstitutionNode(0, Infinity, Infinity, element_contents.slice(missing_node_start, -4));
		else
			TempNode = new NODE_PROTOTYPE_MAPPER[missing_node.type](0, Infinity, element_contents.slice(missing_node_start, -4));
		new_element += element_contents.slice(previous_start, missing_node_start) + TempNode.postprocess(true, settings.preview_mode, 'span');
		previous_start = Infinity;
	}
	new_element += element_contents.slice(previous_start);

	el.innerHTML = new_element;
}
