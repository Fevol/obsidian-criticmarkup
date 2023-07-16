import { CriticMarkupRange } from '../../types';
import { CriticMarkupNode, CriticMarkupNodes } from '../criticmarkup-nodes';
import { CharCategory, EditorSelection, EditorState, Text } from '@codemirror/state';
import { findBlockingChar, getCharCategory } from '../editor-util';

// To the poor soul who comes across this code, I hope you have more luck wrapping your head around cursor logic than I had
// I sincerely, sincerely hope that I don't ever have to touch this godforsaken, demonic, cursed and all-around evil code ever again.



// FIXME: sometimes, when multiple cursors are used, position of cursor is on the wrong side of a bracket
//		Hypothesis: probably due to middle-mouse multiple selection creation having anchor be selected instead of head?
// FIXME: regular cursor movement is broken
// FIXME: adjacent node check

function encountered_character(head: number, nodes: CriticMarkupNodes, backwards_select: boolean, state: EditorState, cat_before: null | CharCategory = null): number {
	let cat_during = null;
	// FIXME: cat_during is probably always wrong (2, because of brackets) [PROBABLY FIXED]
	const original_head = head;
	[head, cat_during] = findBlockingChar(head, !backwards_select, state, cat_before === 1 || cat_before === null, cat_before);

	const node = nodes.adjacent_to_cursor(original_head, backwards_select);
	// FIXME: can be simplified to single statement: head <= ...
	if (!node || (!node.encloses(head) && !nodes.at_cursor(head, false, true)))
		return head;

	const offset = !backwards_select ? 1 : -1;

	// CASE 1: After moving, cursor ends up at the same place; usually the case if text category after cursor changes
	// 		   {++░XXXX▒++}$$$ --> {++XXXX░++}$$$
	if (head === original_head)
		return (!backwards_select ? node.to : node.from) - 3 * offset;

	const node_front = !backwards_select ? node.from : node.to;


	// if (head === node_front)
	cat_during = getCharCategory(node_front - offset, state, backwards_select);
	const resulting_head = encountered_node(node_front + 3 * offset, node, nodes, backwards_select, state, cat_during);
	// FIXME: Check if necessary
	if (resulting_head === node_front + 3 * offset)
		return node_front;
	return resulting_head;

}

function encountered_node(head: number, node: CriticMarkupNode, nodes: CriticMarkupNodes, backwards_select: boolean, state: EditorState, cat_before: null | CharCategory = null): number {
	const node_front = !backwards_select ? node.from : node.to;
	const node_back = !backwards_select ? node.to : node.from;
	const offset = !backwards_select ? 1 : -1;

	let cat_during = null;

	// If head is not PAST the back bracket
	if (!node.cursor_infront(head, backwards_select)) {
		const cat_inside = node.empty() ? null : getCharCategory(node_front + 3 * offset, state, backwards_select);
		// CASE 1: Cursor cannot enter node
		if (cat_inside !== null && cat_before !== null && cat_before !== 1 && cat_inside !== cat_before)
			return head;
		if (head === node_front)
			head = node_front + 3 * offset;


		// Head is now guaranteed to be either in the beginning of, or inside the node
		[head, cat_during] = findBlockingChar(head, !backwards_select, state, cat_before === 1 || cat_before === null, cat_before);

		// FIXME: is the last character before brackets always representative of the category?
		cat_during = getCharCategory(node_back - 4 * offset, state, backwards_select);

		if (!node.cursor_infront(head, backwards_select))
			return head;

	}

	const adjacent_node = nodes.adjacent_to_node(node, backwards_select, true);
	if (!adjacent_node) {
		// FIXME: Only add offset in FWD?
		const cat_after = getCharCategory(node_back, state, backwards_select);
		if ((cat_during !== null && cat_during !== 1) && cat_during !== cat_after)
			return node_back - 3 * offset;
		return encountered_character(node_back, nodes, backwards_select, state, cat_during);
	} else {
		const adjacent_node_front = !backwards_select ? adjacent_node.from : adjacent_node.to;
		const resulting_head = encountered_node(adjacent_node_front  + 3 * offset, adjacent_node, nodes, backwards_select, state, cat_during);
		if (resulting_head === adjacent_node_front + 3 * offset)
			return node_back - 3 * offset;
		return resulting_head;
	}
}


export function cursor_move(range: CriticMarkupRange, original_range: CriticMarkupRange, nodes: CriticMarkupNodes, doc: Text, state: EditorState,
							backwards_select: boolean, group_select: boolean, is_selection: boolean, block_cursor = false) {
	let head = range.head!, anchor = range.anchor!;

	const node = nodes.adjacent_to_cursor(original_range.head!, backwards_select, true);

	// Logic should ONLY execute when cursor passes a node in some way
	// FIXME: logic should execute ONLY when cursor passes a BRACKET
	if (node && (!backwards_select ? head >= node.from : head <= node.to)) {
		if (group_select) {
			if (node.encloses(original_range.head!)) {
				head = encountered_node(original_range.head!, node, nodes, backwards_select, state);
			} else {
				head = encountered_character(original_range.head!, nodes, backwards_select, state);
			}
		} else {
			if (backwards_select) {
				if (node.touches_right_bracket(head, block_cursor)) {
					head = Math.max(node.to - 4, node.from + 3);
				} else if (node.touches_left_bracket(head, block_cursor)) {
					const adjacent_node = nodes.adjacent_to_node(node, true, true);
					if (adjacent_node)
						head = Math.max(adjacent_node.to - 4, adjacent_node.from + 3);
					else
						head = Math.max(node.from - 1, 0);
				}
			} else {
				if (node.touches_left_bracket(head, block_cursor)) {
					head = Math.min(node.from + 4, node.to - 3);

					if (block_cursor)
						head -= 1;
				} else if (node.touches_right_bracket(head, block_cursor)) {
					const adjacent_node = nodes.adjacent_to_node(node, false, true);
					if (adjacent_node)
						head = Math.min(adjacent_node.from + 4, adjacent_node.to - 3);
					else
						head = Math.min(node.to + 1, doc.length);

					if (block_cursor)
						head -= 1;
				}
			}
		}
	}

	if (!is_selection)
		anchor = head;

	return {selection: EditorSelection.range(anchor, head)};



}
