import IntervalTree, { Node } from "@flatten-js/interval-tree";
import { Plugin } from "obsidian";
import CommentatorPlugin from "../main";

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
	interface Plugins {
		plugins: Record<string, Plugin> & {
			"commentator": CommentatorPlugin;
		};
	}
}
