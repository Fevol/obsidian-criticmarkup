<script lang='ts'>
	import type CommentatorPlugin from '../../main';

	import { onDestroy, onMount } from 'svelte';
	import { MarkdownRenderer, Icon, View, StateButton, NavHeader, Button, Input, clickOutside } from '../components';
	import VirtualList from 'svelte-virtual-list-ce';

	import { type TFile, Menu, debounce, prepareSimpleSearch } from 'obsidian';

	import { NodeType } from '../../types';
	import { NODE_ICON_MAPPER, NODE_PROTOTYPE_MAPPER, type CriticMarkupNode } from '../../editor/criticmarkup-nodes';
	import { acceptSuggestionsInFile } from '../../editor/commands';

	export let plugin: CommentatorPlugin;

	let selected_nodes: [string, CriticMarkupNode][] = [];

	enum NodeTypeFilter {
		ALL,
		ADDITION,
		DELETION,
		SUBSTITUTION,
		HIGHLIGHT,
		COMMENT,
	}

	enum LocationFilter {
		VAULT,
		FOLDER,
		FILE,
	}

	enum ContentFilter {
		ALL,
		CONTENT,
		EMPTY,
	}

	export let node_type_filter: NodeTypeFilter = NodeTypeFilter.ALL;
	export let location_filter: LocationFilter = LocationFilter.VAULT;
	export let content_filter: ContentFilter = ContentFilter.ALL;
	let search_filter: string = '';

	const file_change_event = plugin.app.workspace.on('active-leaf-change', async () => {
		filterNodes();
	});

	let all_nodes: [string, { data: CriticMarkupNode[], time: number }][] | null = null;
	let flattened_nodes: {path: string, node: CriticMarkupNode, text: string[]}[] = [];

	const node_filters = [
		{ icon: 'asterisk', tooltip: 'All markup' },
		{ icon: 'plus-circle', tooltip: 'Addition markup' },
		{ icon: 'minus-square', tooltip: 'Deletion markup' },
		{ icon: 'replace', tooltip: 'Substitution markup' },
		{ icon: 'highlighter', tooltip: 'Highlight markup' },
		{ icon: 'message-square', tooltip: 'Comment markup' },
	];

	const location_filters = [
		{ icon: 'vault', tooltip: 'Entire vault' },
		{ icon: 'folder-closed', tooltip: 'Current folder' },
		{ icon: 'file', tooltip: 'Current file' },
	];

	const content_filters = [
		{ icon: 'maximize', tooltip: "All nodes" },
		{ icon: 'square', tooltip: "Only nodes with content" },
		{ icon: 'box-select', tooltip: "Only empty nodes" },
	]

	const debouncedUpdate = debounce(filterNodes, 500);

	const undo_history: Record<string, string>[] = [];


	onMount(async () => {
		await updateNodes();
	});

	onDestroy(() => {
		plugin.app.workspace.offref(file_change_event);
	});

	export async function updateNodes() {
		all_nodes = (await plugin.database.allEntries() as [string, { data: CriticMarkupNode[], time: number }][])
			.filter(([_, value]) => value.data.length > 0)
			.map(([key, value]) => {
				return [key, {
					data: value.data.map(node => {
						node.__proto__ = NODE_PROTOTYPE_MAPPER[node.type].prototype;
						return node;
					}),
					time: value.time,
				}];
			});
		await filterNodes();
	}


	$: node_type_filter, location_filter, content_filter, selected_nodes = [], filterNodes();

	// TODO: File cache should be a TEMPORARY solution
	const file_cache: Record<string, string> = {};

	async function filterNodes(): Promise<void> {
		if (!all_nodes) return;
		let temp = all_nodes!;

		if (location_filter !== LocationFilter.VAULT) {
			const active_file = plugin.app.workspace.getActiveFile();
			if (active_file) {
				if (location_filter === LocationFilter.FOLDER)
					temp = all_nodes.filter(([key, _]) => key.startsWith(active_file.parent?.path ?? ''));
				else if (location_filter === LocationFilter.FILE)
					temp = all_nodes.filter(([key, _]) => key === active_file.path);
			}
		}

		if (node_type_filter !== NodeTypeFilter.ALL) {
			temp = temp.filter(([_, value]) => value.data.some(node => node.type === node_type_filter - 1));
		}

		for (const [key, _] of temp) {
			const file = plugin.app.vault.getAbstractFileByPath(key);
			if (!file) continue;
			file_cache[key] = await plugin.app.vault.cachedRead(<TFile>file);
		}

		if (search_filter.length) {
			const primitiveSearcher = prepareSimpleSearch(search_filter);
			temp = temp.map(([key, value]) => {
				return [key, {
					data: value.data.filter(node => primitiveSearcher(node.unwrap_parts(file_cache[key]).join(' '))?.score),
					time: value.time,
				}];
			});
			temp = temp.filter(([_, value]) => value.data.length > 0);
		}

		flattened_nodes = temp.flatMap(([key, value]) => value.data.map(node => {
			return {path: key, node: node, text: visibleText(key, node)}
		}));

		if (content_filter !== ContentFilter.ALL) {
			flattened_nodes = flattened_nodes.filter(item => (content_filter === ContentFilter.CONTENT) !== item.node.empty());
		}
	}

	function visibleText(path: string, node: CriticMarkupNode): string[] {
		if (!file_cache[path]) return [''];
		node.__proto__ = NODE_PROTOTYPE_MAPPER[node.type].prototype;
		return node.unwrap_parts(file_cache[path]);
	}
</script>

<View>
	<svelte:fragment slot='header'>
		<NavHeader>
			<svelte:fragment slot='container'>
				<div class='commentator-view-search search-input-container'>
					<Input
						value={search_filter}
						type='text'
						enterkeyhint='search'
						placeholder={"Search..."}
						spellcheck={false}
						onChange={(value) => {
							search_filter = value;
							debouncedUpdate();
						}}
					/>
				</div>

				<StateButton
					onContextMenu={(e) => {
						let menu = new Menu();

						node_filters.map((filter, index) => {
							menu.addItem((item) => {
								item.setTitle(filter.tooltip);
								item.setIcon(filter.icon);
								item.onClick(() => {
									node_type_filter = index;
								});
							});
						});

						menu.showAtMouseEvent(e);
					}}
					class='clickable-icon nav-action-button'
					bind:value={node_type_filter}
					states={node_filters}
				/>
				<Button class='clickable-icon nav-action-button' icon='lasso' tooltip='Select all markup' onClick={() => {
					selected_nodes = all_nodes.flatMap(([key, value]) => value.data.map(node => [key, node]));
				}} />
				<StateButton
					onContextMenu={(e) => {
						let menu = new Menu();

						location_filters.map((filter, index) => {
							menu.addItem((item) => {
								item.setTitle(filter.tooltip);
								item.setIcon(filter.icon);
								item.onClick(() => {
									location_filter = index;
								});
							});
						});

						menu.showAtMouseEvent(e);
					}}
					class='clickable-icon nav-action-button'
					bind:value={location_filter}
					states={location_filters}
				/>
				<StateButton
					onContextMenu={(e) => {
						let menu = new Menu();

						content_filters.map((filter, index) => {
							menu.addItem((item) => {
								item.setTitle(filter.tooltip);
								item.setIcon(filter.icon);
								item.onClick(() => {
									content_filter = index;
								});
							});
						});

						menu.showAtMouseEvent(e);
					}}
					class='clickable-icon nav-action-button'
					bind:value={content_filter}
					states={content_filters}
				/>
			</svelte:fragment>
		</NavHeader>
	</svelte:fragment>

	<svelte:fragment slot='view'>
		{#if flattened_nodes?.length}
			<div class='criticmarkup-view-container'>
				<VirtualList items={flattened_nodes} let:item>
					{#if !node_type_filter || item.node.type === node_type_filter - 1}
						<div class='criticmarkup-view-node'
							 class:criticmarkup-view-node-selected={selected_nodes.some(([key, value]) => key === item.path && value === item.node)}
							 on:click={async (e) => {
									if (e.shiftKey) {
										const original_length = selected_nodes.length;
										selected_nodes = selected_nodes.filter(([key, value]) => key !== item.path || value !== item.node);
										if (selected_nodes.length === original_length)
											selected_nodes.push([item.path, item.node]);
									} else {
										selected_nodes = [];
										const leaves = plugin.app.workspace.getLeavesOfType("markdown");
										if (!leaves.length) return;
										const lastActiveLeaf = leaves.reduce((a, b) => (a.activeTime > b.activeTime) ? a : b);

										const file = plugin.app.vault.getAbstractFileByPath(item.path);
										if (!file) return;
										const view = lastActiveLeaf.view;

										if (file !== view.file)
											await lastActiveLeaf.openFile(file);

										view.editor.setSelection(view.editor.offsetToPos(item.node.from), view.editor.offsetToPos(item.node.to));
									}
								}}
							 on:contextmenu={(e) => {
									const menu = new Menu();
									menu.addItem((item) => {
										item.setTitle("Accept" + (selected_nodes.length ? " selected changes" : " changes"));
										item.setIcon("check");
										item.onClick(() => {
											// TODO: Accept logic
										});
									});
									menu.addItem((item) => {
										item.setTitle("Reject" + (selected_nodes.length ? " selected changes" : " changes"));
										item.setIcon("cross");
										item.onClick(() => {
											// TODO: Reject logic
										});
									});

									menu.showAtMouseEvent(e);
								}}
						>
							<div class='criticmarkup-view-node-top'>
								<Icon size={24} icon={NODE_ICON_MAPPER[item.node.type]} />
								<span class='criticmarkup-view-node-title'>{item.path}</span>
							</div>

							{#key item.text}
								<div class='criticmarkup-view-node-text'>
									{#if !item.text.some(part => part.length)}
										<span class='criticmarkup-view-node-empty'>This node is empty</span>
									{:else}
										<MarkdownRenderer {plugin} text={item.text[0]} source={item.path} />
										{#if item.node.type === NodeType.SUBSTITUTION}
											<MarkdownRenderer {plugin} text={item.text[1]} source={item.path} />
										{/if}
									{/if}
								</div>
							{/key}
						</div>
					{/if}
				</VirtualList>
			</div>
		{/if}
	</svelte:fragment>
</View>
