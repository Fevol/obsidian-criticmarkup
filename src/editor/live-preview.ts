import {
	Decoration,
	DecorationSet,
	EditorView,
	PluginValue,
	ViewPlugin,
	ViewUpdate,
} from '@codemirror/view';
import type { EditorSelection, Extension, Range } from '@codemirror/state';
import type { Tree } from '@lezer/common';

import { criticmarkupLanguage } from './parser';
import { TreeFragment } from '@lezer/common';

import { RangeSet } from '@codemirror/state';
import { buildMarkers, CriticMarkupMarker, gutterExtension } from './criticmarkup-gutter';
import type {PluginSettings} from "../types";

function selectionRangeOverlap(selection: EditorSelection, rangeFrom: number, rangeTo: number) {
	return selection.ranges.some(range => range.from <= rangeTo && range.to >= rangeFrom);
}


export function inlinePlugin(settings: PluginSettings): Extension[] {
	const view_plugin = ViewPlugin.fromClass(
		class CriticMarkupViewPlugin implements PluginValue {
			settings: PluginSettings;
			markers: RangeSet<CriticMarkupMarker>;
			decorations: DecorationSet;
			tree: Tree;
			fragments: TreeFragment[] = [];

			constructor(view: EditorView) {
				this.settings = settings;

				// @ts-ignore (Conflicting Tree definitions of node modules in src/editor/parser and ./)
				this.tree = criticmarkupLanguage.parser.parse(view.state.doc.toString());
				// @ts-ignore
				this.fragments = TreeFragment.addTree(this.tree);

				this.decorations = this.buildDecorations(view) ?? Decoration.none;

				this.markers = buildMarkers(view, this);
			}

			removeBrackets(widgets: Range<Decoration>[], from: number, to: number) {
				widgets.push(
					Decoration.replace({
						attributes: { 'data-contents': 'string' },
					}).range(from, from + 3),
				);

				widgets.push(
					Decoration.replace({
						attributes: { 'data-contents': 'string' },
					}).range(to - 3, to),
				);
			}

			buildDecorations(view: EditorView): DecorationSet {
				const widgets: Range<Decoration>[] = [];
				const selection = view.state.selection;

				const cursor = this.tree.cursor();
				while (cursor.next()) {
					const start = cursor.from;
					const end = cursor.to;
					const name = cursor.name;

					if (name === '⚠' || name === 'MSub') continue;

					// Get next cursor node without moving the cursor itself
					// TODO: Potential use for user warning if CriticMarkup is not closed
					// if (cursor.next() && cursor.name === '⚠') continue;
					// Restore cursor position (warning: recursion error)
					// cursor.prev();

					if (this.settings.suggestion_status && !(name === 'Comment' || name === 'Highlight')) {
						if (this.settings.suggestion_status === 1) {
							if (name === 'Addition') {
								this.removeBrackets(widgets, start, end);
							} else if (name === 'Deletion') {
								widgets.push(
									Decoration.mark({
										class: 'criticmarkup-hidden',
										attributes: { 'data-contents': 'string' },
									}).range(start, end),
								);
							} else {
								cursor.firstChild();
								if (cursor.name !== 'MSub')
									continue;

								widgets.push(
									Decoration.mark({
										class: 'criticmarkup-hidden',
										attributes: { 'data-contents': 'string' },
									}).range(start, cursor.to),
								);

								widgets.push(
									Decoration.replace({
										attributes: { 'data-contents': 'string' },
									}).range(end - 3, end),
								);
							}
						} else {
							if (name === 'Addition') {
								widgets.push(
									Decoration.mark({
										attributes: { 'data-contents': 'string' },
										class: 'criticmarkup-hidden',
									}).range(start, end),
								);
							} else if (name === 'Deletion') {
								this.removeBrackets(widgets, start, end);
							} else {
								cursor.firstChild();
								if (cursor.name !== 'MSub')
									continue;

								widgets.push(
									Decoration.mark({
										attributes: { 'data-contents': 'string' },
										class: 'criticmarkup-hidden',
									}).range(cursor.from, end),
								);

								widgets.push(
									Decoration.replace({
										attributes: { 'data-contents': 'string' },
									}).range(start, start + 3),
								);
							}
						}
					} else {
						if (selectionRangeOverlap(selection, start, end)) {
							// Mark CriticMarkup as being edited, disables strikethrough/highlight styling
							widgets.push(
								Decoration.mark({
									attributes: { 'data-contents': 'string' },
									class: 'criticmarkup-editing',
								}).range(start, end),
							);
							continue;
						}

						// FIXME: Strikethrough renders despite text being placed (due to {~~ brackets never being hidden?)
						this.removeBrackets(widgets, start, end);

						if (name === 'Substitution') {
							cursor.firstChild();
							if (cursor.name !== 'MSub')
								continue;

							// Hide arrow marker ~>
							widgets.push(
								Decoration.replace({
									attributes: { 'data-contents': 'string' },
								}).range(cursor.from, cursor.to),
							);

							if (start + 3 !== cursor.from) {
								widgets.push(
									Decoration.mark({
										attributes: { 'data-contents': 'string' },
										class: 'criticmarkup-inline criticmarkup-substitution criticmarkup-deletion',
									}).range(start + 3, cursor.from),
								);
							}

							if (cursor.to !== end - 3) {
								widgets.push(
									Decoration.mark({
										attributes: { 'data-contents': 'string' },
										class: 'criticmarkup-inline criticmarkup-substitution criticmarkup-addition',
									}).range(cursor.from + 2, end - 3),
								);
							}
						} else if (start + 3 !== end - 3) {
							// Render CriticMarkup as *something* (inline/comment style)
							widgets.push(
								Decoration.mark({
									attributes: { 'data-contents': 'string' },
									class: 'criticmarkup-inline criticmarkup-' + name.toLowerCase(),
									spec: { style: 'text-decoration: line-through;' },
								}).range(start + 3, end - 3),
							);
						}
					}


				}

				return Decoration.set(widgets, true);
			}

			update(update: ViewUpdate) {
				// @ts-ignore
				const tree = criticmarkupLanguage.parser.parse(update.state.doc.toString(), this.fragments);
				if (tree.length < update.view.viewport.to || update.view.composing)
					this.decorations = this.decorations.map(update.changes);
					// TODO: Figure out how to implement the 'hasEffect' helper function, or determine if it is even necessary
				// @ts-ignore
				else if (tree != this.tree ||
					update.viewportChanged || update.selectionSet /*||
			hasEffect(update.transactions, rerenderEffect) ||
			hasEffect(update.transactions, addMarks) || hasEffect(update.transactions, filterMarks)*/) {

					// @ts-ignore
					this.tree = tree;

					// @ts-ignore
					this.fragments = TreeFragment.addTree(tree, this.fragments);

					// If tree has any CriticMarkup nodes, build decorations
					if (this.tree.topNode.firstChild) {
						if (this.settings.live_preview)
							this.decorations = this.buildDecorations(update.view);
						if (this.settings.editor_gutter)
							this.markers = buildMarkers(update.view, this);
					} else {
						this.decorations = Decoration.none;
						this.markers = RangeSet.empty;
					}
				}
			}
		},
		{
			decorations: (v) => v.decorations,
		},
	);

	if (settings.editor_gutter) {
		const gutter_extension = gutterExtension(view_plugin);
		return [view_plugin, gutter_extension];
	}
	return [view_plugin];
}
