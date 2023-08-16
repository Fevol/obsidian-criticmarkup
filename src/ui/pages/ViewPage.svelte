<script lang='ts'>
	import { MarkdownRenderer, Icon, View, StateButton } from '../components';
	import type TranslatorPlugin from '../../main';
	import NavHeader from '../components/obsidian/NavHeader.svelte';
	import VirtualList from 'svelte-virtual-list-ce';
	import type { CriticMarkupNode } from '../../editor/criticmarkup-nodes';
	import type { TFile } from 'obsidian';
	import { onDestroy, onMount } from 'svelte';
	import { NODE_ICON_MAPPER, NODE_PROTOTYPE_MAPPER } from '../../editor/criticmarkup-nodes';
	import { Menu } from 'obsidian';
	import { NodeType } from '../../types';
	import Button from '../components/base/Button.svelte';

	export let plugin: TranslatorPlugin;

	let selected_nodes: [string, CriticMarkupNode][] = [];

	export let filter_node_type = 0;
	export let filter_location = 0;

	const file_change_event = plugin.app.workspace.on("active-leaf-change", async () => {
		filterNodes();
	});

	let all_nodes: [string, { data: CriticMarkupNode[], time: number }][] | null = null;
	let filtered_nodes: [string, { data: CriticMarkupNode[], time: number }][] | null = null;

	const node_filters = [
		{ icon: "asterisk", tooltip: "All markup" },
		{ icon: "plus-circle", tooltip: "Addition markup" },
		{ icon: "minus-square", tooltip: "Deletion markup" },
		{ icon: "replace", tooltip: "Substitution markup" },
		{ icon: "highlighter", tooltip: "Highlight markup" },
		{ icon: "message-square", tooltip: "Comment markup" }
	]

	const location_filters = [
		{ icon: "vault", tooltip: "Entire vault" },
		{ icon: "folder-closed", tooltip: "Current folder" },
		{ icon: "file", tooltip: "Current file" }
	]


	onMount(async () => {
		await updateNodes();
	});

	onDestroy(() => {
		plugin.app.workspace.offref(file_change_event);
	});

	export async function updateNodes() {
		all_nodes = (await plugin.database.allEntries() as [string, { data: CriticMarkupNode[], time: number }][])
			.filter(([key, value]) => value.data.length > 0);
		filterNodes();
	}


	$: filter_node_type, filter_location, selected_nodes = [], filterNodes();

	function filterNodes(): void {
		filtered_nodes = all_nodes;
		if (!all_nodes) return;

		if (filter_location) {
			const active_file = plugin.app.workspace.getActiveFile();
			if (active_file) {
				if (filter_location === 1)
					filtered_nodes = all_nodes!.filter(([key, _]) => key.startsWith(active_file.parent?.path ?? ''));
				else if (filter_location === 2) {
					filtered_nodes = all_nodes!.filter(([key, _]) => key === active_file.path);
				}
			}
		}

		if (filter_node_type)
			filtered_nodes = all_nodes!.filter(([key, value]) => value.data.some(node => node.type === filter_node_type - 1));
	}

	// FIXME: Probably inefficient reading of files?
	async function visibleText(path: string, node: CriticMarkupNode): Promise<string[]> {
		const file = plugin.app.vault.getAbstractFileByPath(path);
		if (!file) return [''];
		const contents = await plugin.app.vault.cachedRead(<TFile>file);

		node.__proto__ = NODE_PROTOTYPE_MAPPER[node.type].prototype;

		return node.unwrap_parts(contents);
	}
</script>

<View>
	<svelte:fragment slot='header'>
		<NavHeader>
			<svelte:fragment slot='container'>
				<StateButton
					onContextMenu={(e) => {
						let menu = new Menu();

						node_filters.map((filter, index) => {
							menu.addItem((item) => {
								item.setTitle(filter.tooltip);
								item.setIcon(filter.icon);
								item.onClick(() => {
									filter_node_type = index;
								});
							});
						});

						menu.showAtMouseEvent(e);
					}}
					class='clickable-icon nav-action-button'
					bind:value={filter_node_type}
					states={node_filters}
				/>
				<Button class='clickable-icon nav-action-button' icon='lasso' tooltip='Select all markup' onClick={() => {
					selected_nodes = all_nodes.flatMap(([key, value]) => value.data.map(node => [key, node]));
				}}/>
				<StateButton
					onContextMenu={(e) => {
						let menu = new Menu();

						location_filters.map((filter, index) => {
							menu.addItem((item) => {
								item.setTitle(filter.tooltip);
								item.setIcon(filter.icon);
								item.onClick(() => {
									filter_location = index;
								});
							});
						});

						menu.showAtMouseEvent(e);
					}}
					class='clickable-icon nav-action-button'
					bind:value={filter_location}
					states={location_filters}
				/>

			</svelte:fragment>
		</NavHeader>
	</svelte:fragment>

	<svelte:fragment slot='view'>
		{#if filtered_nodes?.length}
			<div class='criticmarkup-view-container'>
				<VirtualList items={filtered_nodes} let:item>
					{#each item[1].data as node}
						{#if !filter_node_type || node.type === filter_node_type - 1}
							<div class='criticmarkup-view-node'
								class:criticmarkup-view-node-selected={selected_nodes.some(([key, value]) => key === item[0] && value === node)}
								on:click={async (e) => {
									if (e.shiftKey) {
										const original_length = selected_nodes.length;
										selected_nodes = selected_nodes.filter(([key, value]) => key !== item[0] || value !== node);
										if (selected_nodes.length === original_length)
											selected_nodes.push([item[0], node]);
									} else {
										selected_nodes = [];
										const leaves = plugin.app.workspace.getLeavesOfType("markdown");
										if (!leaves.length) return;
										const lastActiveLeaf = leaves.reduce((a, b) => (a.activeTime > b.activeTime) ? a : b);

										const file = plugin.app.vault.getAbstractFileByPath(item[0]);
										if (!file) return;
										const view = lastActiveLeaf.view;

										if (file !== view.file)
											await lastActiveLeaf.openFile(file);

										view.editor.setSelection(view.editor.offsetToPos(node.from), view.editor.offsetToPos(node.to));
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

								{#await visibleText(item[0], node)}
									<br />
								{:then text}
									<div class='criticmarkup-view-node-top'>
										<Icon size={24} icon={NODE_ICON_MAPPER[node.type]} />
										<span class='criticmarkup-view-node-title'>{item[0]}</span>
									</div>

									<div class='criticmarkup-view-node-text'>
										{#if !text.some(part => part.length)}
											<span class='criticmarkup-view-node-empty'>This node is empty</span>
										{:else}
											<!--{#if node.type === NodeType.ADDITION}-->
											<!--	<b>ADD:</b>-->
											<!--{:else if node.type === NodeType.DELETION}-->
											<!--	<b>DELETE:</b>-->
											<!--{:else if node.type === NodeType.SUBSTITUTION}-->
											<!--	<b>REPLACE:</b>-->
											<!--{/if}-->

											<MarkdownRenderer {plugin} text={text[0]} source={item[0]}/>

											{#if node.type === NodeType.SUBSTITUTION}
<!--												<br />-->
<!--												<b>WITH:</b>-->
												<MarkdownRenderer {plugin} text={text[1]} source={item[0]}/>
											{/if}
										{/if}
									</div>
								{/await}
							</div>
						{/if}
					{/each}
				</VirtualList>
			</div>
		{/if}
	</svelte:fragment>
</View>
