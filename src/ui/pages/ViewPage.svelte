<script lang='ts'>
	import { MarkdownRenderer, Icon, View, StateButton } from '../components';
	import type TranslatorPlugin from '../../main';
	import NavHeader from '../components/obsidian/NavHeader.svelte';
	import VirtualList from 'svelte-virtual-list-ce';
	import type { CriticMarkupNode } from '../../editor/criticmarkup-nodes';
	import type { TFile } from 'obsidian';
	import { onMount } from 'svelte';
	import { NODE_ICON_MAPPER, NODE_PROTOTYPE_MAPPER } from '../../editor/criticmarkup-nodes';
	import { Menu } from 'obsidian';

	export let plugin: TranslatorPlugin;

	let selected_nodes: [string, CriticMarkupNode][] = [];
	let filter_type = 0;
	let all_nodes: [string, { data: CriticMarkupNode[], time: number }][] | null = null;
	let node_selection: [string, { data: CriticMarkupNode[], time: number }][] | null = null;

	const node_filters = [
		{ icon: "asterisk", tooltip: "All markup" },
		{ icon: "plus-circle", tooltip: "Addition markup" },
		{ icon: "minus-square", tooltip: "Deletion markup" },
		{ icon: "replace", tooltip: "Substitution markup" },
		{ icon: "highlighter", tooltip: "Highlight markup" },
		{ icon: "message-square", tooltip: "Comment markup" }
	]

	onMount(async () => {
		all_nodes = (await plugin.database.allEntries() as [string, { data: CriticMarkupNode[], time: number }][])
			.filter(([key, value]) => value.data.length > 0);
		filterNodes();
	});


	$: filter_type, selected_nodes = [], filterNodes();

	function filterNodes(): void {
		if (!filter_type)
			node_selection = all_nodes;
		else
			node_selection = all_nodes!.filter(([key, value]) => value.data.some(node => node.type === filter_type - 1));
	}

	// FIXME: Probably inefficient reading of files?
	async function visibleText(path: string, node: CriticMarkupNode): Promise<string> {
		const file = plugin.app.vault.getAbstractFileByPath(path);
		if (!file) return '';
		const contents = await plugin.app.vault.cachedRead(<TFile>file);

		node.__proto__ = NODE_PROTOTYPE_MAPPER[node.type].prototype;

		return node.unwrap(contents);
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
									filter_type = index;
								});
							});
						});

						menu.showAtMouseEvent(e);
					}}
					class='clickable-icon nav-action-button'
					bind:value={filter_type}
					states={node_filters}
				/>
			</svelte:fragment>
		</NavHeader>
	</svelte:fragment>

	<svelte:fragment slot='view'>
		{#if node_selection?.length}
			<div class='criticmarkup-view-container'>
				<VirtualList items={node_selection} let:item>
					{#each item[1].data as node}
						{#if !filter_type || node.type === filter_type - 1}
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
										<Icon icon={NODE_ICON_MAPPER[node.type]} />
										<span class='criticmarkup-view-node-title'>{item[0]}</span>
									</div>

									<div class='criticmarkup-view-node-text'>
										{#if !text.length}
											<span class='criticmarkup-view-node-empty'>This node is empty</span>
										{:else}
											<MarkdownRenderer {plugin} {text}/>
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
