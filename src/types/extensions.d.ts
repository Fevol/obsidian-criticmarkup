import IntervalTree, { Node } from "@flatten-js/interval-tree";
import CommentatorPlugin from "../main";
import { PluginsPluginsRecord } from "obsidian-typings";

declare module "@flatten-js/interval-tree" {
	export default interface IntervalTree<T = unknown> {
		nil_node: Node<T>;

		recalc_max(node: Node<T>): void;

		tree_walk(node: Node<T>, callback: (node: Node<T>) => void): void;

		tree_search_interval(node: Node<T>, search_node: Node, resulting_nodes: Node[]): void;

		tree_search_nearest_forward(node: Node<T>, search_node: Node): Node<T> | null;
	}

	export interface Node<T = unknown> {
		max: Interval;

		not_intersect_left_subtree(search_node: Node): boolean;

		not_intersect_right_subtree(search_node: Node): boolean;
	}
}

declare module "obsidian" {
	interface MarkdownEditView {
		annotationGutterFolded: boolean;
		annotationGutterWidth: number;
	}
}

declare module "obsidian-typings" {
	interface PluginsPluginsRecord {
		commentator: CommentatorPlugin;
	}
}
