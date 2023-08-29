<script lang='ts'>
	import type CommentatorPlugin from '../../main';

	import { onDestroy, onMount } from 'svelte';
	import { MarkdownRenderer, Icon, View, StateButton, NavHeader, Button, Input, VirtualList, clickOutside } from '../components';

	import { type TFile, Menu, debounce, prepareSimpleSearch, Notice } from 'obsidian';

	import { NodeType } from '../../types';
	import { NODE_ICON_MAPPER, NODE_PROTOTYPE_MAPPER, type CriticMarkupNode } from '../../editor/criticmarkup-nodes';
    import { acceptSuggestionsInFile, rejectSuggestionsInFile } from '../../editor/commands';

	export let plugin: CommentatorPlugin;


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

	type NodeEntry = {
		path: string,
		node: CriticMarkupNode,
		text: string[],
	}

	export let node_type_filter: NodeTypeFilter = NodeTypeFilter.ALL;
	export let location_filter: LocationFilter = LocationFilter.VAULT;
	export let content_filter: ContentFilter = ContentFilter.ALL;
	let search_filter: string = '';

	const file_change_event = plugin.app.workspace.on('active-leaf-change', async () => {
		filterNodes();
	});

	let all_nodes: [string, { data: CriticMarkupNode[], time: number }][] | null = null;
	let flattened_nodes: NodeEntry[] = [];
	let selected_nodes: number[] = [];
	let anchor_selected_node: number | null = null;

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

	const undo_history: {file_history: Record<string, string>, selected_nodes: number[]}[] = [];

	// TODO: File cache should be a TEMPORARY solution
	const file_cache: Record<string, string> = {};

	onMount(async () => {
		plugin.database.on("database-update", updateNodes)

		await updateNodes(await plugin.database.allEntries());
	});

	onDestroy(() => {
		plugin.app.workspace.offref(file_change_event);
	});

	async function updateNodes(nodes: [string, { data: CriticMarkupNode[], time: number }][] = []) {
		all_nodes = nodes
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


	$: node_type_filter, location_filter, content_filter, selected_nodes = [], anchor_selected_node = null, filterNodes();



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

		for (const [key, _] of temp) {
			const file = plugin.app.vault.getAbstractFileByPath(key);
			if (!file) continue;
			file_cache[key] = await plugin.app.vault.cachedRead(<TFile>file);
		}

        flattened_nodes = temp.flatMap(([key, value]) => value.data.map(node => {
            return {path: key, node: node, text: visibleText(key, node)}
        }));

        if (node_type_filter !== NodeTypeFilter.ALL)
            flattened_nodes = flattened_nodes.filter(item => item.node.type === node_type_filter - 1);

        if (content_filter !== ContentFilter.ALL)
            flattened_nodes = flattened_nodes.filter(item => (content_filter === ContentFilter.CONTENT) !== item.node.empty());

		if (search_filter.length)
            flattened_nodes = flattened_nodes.filter(item => prepareSimpleSearch(search_filter)(item.text.join(' '))?.score);
	}

	function visibleText(path: string, node: CriticMarkupNode): string[] {
		if (!file_cache[path]) return [''];
		node.__proto__ = NODE_PROTOTYPE_MAPPER[node.type].prototype;
		return node.unwrap_parts(file_cache[path]);
	}

	async function editSelectedNodes(accept: boolean, entry?: number) {
		if (entry && !selected_nodes.length) {
			selected_nodes = [entry];
			anchor_selected_node = entry;
		}

		const current_nodes = selected_nodes.map(value => flattened_nodes[value]);

        const grouped_nodes = current_nodes.reduce((acc: Record<string, CriticMarkupNode[]>, {path, node}) => {
			if (!acc[path]) acc[path] = [];
			acc[path].push(node);
			return acc;
		}, {});

        const editFunction = accept ? acceptSuggestionsInFile : rejectSuggestionsInFile;

		const file_history: Record<string, string> = {};
		for (const [key, value] of Object.entries(grouped_nodes)) {
			const file = plugin.app.vault.getAbstractFileByPath(key);
			if (!file) continue;
			file_history[key] = await plugin.app.vault.cachedRead(<TFile>file);
			await editFunction(<TFile>file, value);
		}
		undo_history.push({file_history, selected_nodes});
		selected_nodes = [];
	}

	async function handleKey(e: KeyboardEvent) {
		if (e.key === 'z' && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
			if (undo_history.length) {
				const undo_history_entry = undo_history.pop()!;
				selected_nodes = undo_history_entry.selected_nodes;
				for (const [key, value] of Object.entries(undo_history_entry.file_history)) {
					const file = plugin.app.vault.getAbstractFileByPath(key);
					if (!file) continue;
					await plugin.app.vault.modify(<TFile>file, value);
				}
			} else {
				new Notice("There is nothing to undo", 4000)
			}
		} else if (e.key === 'a' && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
            selected_nodes = Array.from(flattened_nodes.keys());
			anchor_selected_node = 0;
        } else if (e.key === 'Escape') {
			selected_nodes = [];
			anchor_selected_node = null;
        }
	}


    async function onClickOutside() {
        selected_nodes = [];
		anchor_selected_node = null;
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

				<div style='display: flex'>
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
						selected_nodes = Array.from(flattened_nodes.keys());
						anchor_selected_node = 0;
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
				</div>
			</svelte:fragment>
		</NavHeader>
	</svelte:fragment>

	<svelte:fragment slot='view'>
		<div class='criticmarkup-view-container' tabindex='-1' use:clickOutside={".menu"} on:click_outside={onClickOutside} on:keydown={handleKey}>
			<VirtualList items={flattened_nodes} let:item let:index>
				<div class='criticmarkup-view-node'
					 class:criticmarkup-view-node-selected={selected_nodes.some(value => value === index)}
					 on:click={async (e) => {
							if (e.shiftKey) {
								if (anchor_selected_node) {
									const start = Math.min(anchor_selected_node, index);
									const end = Math.max(anchor_selected_node, index);
									selected_nodes = Array.from({length: end - start + 1}, (_, i) => i + start);
								} else {
									selected_nodes = [index];
									anchor_selected_node = index;
								}
							} else if (e.ctrlKey || e.metaKey) {
								anchor_selected_node = index;
								const original_length = selected_nodes.length;
								selected_nodes = selected_nodes.filter((value) => value !== index);
								if (selected_nodes.length === original_length)
									selected_nodes = [...selected_nodes, index];
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
							menu.addItem((m_item) => {
								m_item.setTitle("Accept" + (selected_nodes.length ? " selected changes" : " changes"));
								m_item.setIcon("check");
								m_item.onClick(async () => editSelectedNodes(true, index));
							});
							menu.addItem((m_item) => {
								m_item.setTitle("Reject" + (selected_nodes.length ? " selected changes" : " changes"));
								m_item.setIcon("cross");
								m_item.onClick(async () => editSelectedNodes(false, index));
							});

							menu.showAtMouseEvent(e);
						}}
				>
					<!-- TODO: Only show path if folder/vault-wide filter is active -->
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
			</VirtualList>
		</div>
	</svelte:fragment>
</View>
