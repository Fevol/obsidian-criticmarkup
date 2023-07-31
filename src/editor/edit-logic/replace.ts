import { CriticMarkupOperation, EditorChange, OperationReturn } from '../../types';
import { CriticMarkupNodes } from '../criticmarkup-nodes';
import { EditorSelection, SelectionRange } from '@codemirror/state';

export function text_replace(range: CriticMarkupOperation, nodes: CriticMarkupNodes, offset: number): OperationReturn {
	const in_range_nodes = nodes.nodes_in_range(range.from, range.to, false);
	const changes: EditorChange[] = [];
	let selection: SelectionRange = EditorSelection.cursor(-1);

	// TODO: This will mostly be identical to the deletion code, save for a few parts

	console.log(range);

	let inserted_text = range.inserted;
	let deleted_text = range.deleted;
	offset += range.offset.added + 8;

	if (!in_range_nodes.length) {
		selection = EditorSelection.cursor(range.to + offset - 3);
		changes.push({
			from: range.from,
			to: range.to,
			insert: `{~~${deleted_text}~>${inserted_text}~~}`,
		});
	}

	console.log(changes, selection, offset)


	return { changes, selection, offset }

}
