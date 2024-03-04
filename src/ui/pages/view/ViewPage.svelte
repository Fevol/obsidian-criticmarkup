<script lang='ts'>
	import type CommentatorPlugin from '../../../main';

	import { onDestroy, onMount } from 'svelte';
	import { MarkdownRenderer, Icon, View, StateButton, NavHeader, Button, Input, VirtualList, clickOutside } from '../../components';

	import { type TFile, Menu, debounce, prepareSimpleSearch, Notice } from 'obsidian';

	import { type DatabaseEntry } from '../../../database';

	import {
		SuggestionType, SUGGESTION_ICON_MAPPER, type CriticMarkupRange, type CommentRange,
		acceptSuggestionsInFile, rejectSuggestionsInFile,
	} from '../../../editor/base';

	export let plugin: CommentatorPlugin;


	enum SuggestionTypeFilter {
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

	type RangeEntry = { path: string, range: CriticMarkupRange }

	export let range_type_filter: SuggestionTypeFilter = SuggestionTypeFilter.ALL;
	export let location_filter: LocationFilter = LocationFilter.VAULT;
	export let content_filter: ContentFilter = ContentFilter.ALL;
	let search_filter: string = '';

	const file_change_event = plugin.app.workspace.on('active-leaf-change', filterRanges);

	let all_ranges: DatabaseEntry<CriticMarkupRange[]>[] = [];
	let flattened_ranges: RangeEntry[] = [];
	let selected_ranges: number[] = [];
	let anchor_selected_range: number | null = null;
	let hover_index: number | null = null;

	const range_filters = [
		{ icon: 'asterisk', tooltip: 'All markup' },
		{ icon: 'plus-circle', tooltip: 'Addition markup' },
		{ icon: 'minus-square', tooltip: 'Deletion markup' },
		{ icon: 'replace', tooltip: 'Substitution markup' },
		{ icon: 'highlighter', tooltip: 'Highlight markup' },
		{ icon: 'message-square', tooltip: 'Comment markup' },
	];

	const filter_names = [
		"suggestions",
		"insertions",
		"deletions",
		"replacements",
		"highlights",
		"comments",
	]

	const location_filters = [
		{ icon: 'vault', tooltip: 'Entire vault' },
		{ icon: 'folder-closed', tooltip: 'Current folder' },
		{ icon: 'file', tooltip: 'Current file' },
	];

	const content_filters = [
		{ icon: 'maximize', tooltip: "All suggestions" },
		{ icon: 'square', tooltip: "Only suggestions with content" },
		{ icon: 'box-select', tooltip: "Only empty suggestions" },
	]

	const debouncedUpdate = debounce(filterRanges, 500);

	const undo_history: {file_history: Record<string, string>, selected_ranges: number[]}[] = [];

	onMount(() => {
		plugin.database.on("database-update", updateRanges);
		updateRanges(plugin.database.allEntries()!);
	});

	onDestroy(() => {
		plugin.app.workspace.offref(file_change_event);
	});

	async function updateRanges(ranges: DatabaseEntry<CriticMarkupRange[]>[]) {
		all_ranges = ranges;
		await filterRanges();
	}


	$: range_type_filter, location_filter, content_filter, selected_ranges = [], anchor_selected_range = null, filterRanges();



	async function filterRanges() {
		if (!all_ranges) return;
		let temp = all_ranges!;

		if (location_filter !== LocationFilter.VAULT) {
			const active_file = plugin.app.workspace.getActiveFile();
			if (active_file) {
				if (location_filter === LocationFilter.FOLDER)
					temp = all_ranges.filter(([key, _]) => key.startsWith(active_file.parent?.path ?? ''));
				else if (location_filter === LocationFilter.FILE)
					temp = all_ranges.filter(([key, _]) => key === active_file.path);
			}
		}

        flattened_ranges = temp.flatMap(([path, value]) => value.data.map(range => {
            return { path, range }
        }));

		flattened_ranges = flattened_ranges.filter(item => item.range.type !== SuggestionType.COMMENT || !(item.range as CommentRange).attached_comment);

		if (range_type_filter !== SuggestionTypeFilter.ALL)
            flattened_ranges = flattened_ranges.filter(item => item.range.type === range_type_filter - 1);

        if (content_filter !== ContentFilter.ALL)
            flattened_ranges = flattened_ranges.filter(item => (content_filter === ContentFilter.CONTENT) !== item.range.empty());

		if (search_filter.length)
            flattened_ranges = flattened_ranges.filter(item => prepareSimpleSearch(search_filter)(item.range.text)?.score);
	}

	async function editSelectedRanges(accept: boolean, entry: number | null) {
		if (entry != null && !selected_ranges.length) {
			selected_ranges = [entry];
			anchor_selected_range = entry;
		}
		const current_ranges = selected_ranges.map(value => flattened_ranges[value]);

        const grouped_ranges = current_ranges.reduce((acc: Record<string, CriticMarkupRange[]>, {path, range}) => {
			if (!acc[path]) acc[path] = [];
			acc[path].push(range);
			return acc;
		}, {});

        const editFunction = accept ? acceptSuggestionsInFile : rejectSuggestionsInFile;

		const file_history: Record<string, string> = {};
		for (const [key, value] of Object.entries(grouped_ranges)) {
			const file = plugin.app.vault.getAbstractFileByPath(key);
			if (!file) continue;
			file_history[key] = await plugin.app.vault.cachedRead(<TFile>file);
			await editFunction(<TFile>file, value);
		}
		undo_history.push({file_history, selected_ranges});
		selected_ranges = [];
	}

	async function handleKey(e: KeyboardEvent) {
		if (e.key === 'z' && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
			if (undo_history.length) {
				const undo_history_entry = undo_history.pop()!;
				selected_ranges = undo_history_entry.selected_ranges;
				for (const [key, value] of Object.entries(undo_history_entry.file_history)) {
					const file = plugin.app.vault.getAbstractFileByPath(key);
					if (!file) continue;
					await plugin.app.vault.modify(<TFile>file, value);
				}
			} else {
				new Notice("There is nothing to undo", 4000)
			}
		} else if (e.key === 'a' && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
            selected_ranges = Array.from(flattened_ranges.keys());
			anchor_selected_range = 0;
        } else if (e.key === 'Escape') {
			selected_ranges = [];
			anchor_selected_range = null;
        }
	}


    async function onClickOutside() {
        selected_ranges = [];
		anchor_selected_range = null;
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

							range_filters.map((filter, index) => {
								menu.addItem((item) => {
									item.setTitle(filter.tooltip);
									item.setIcon(filter.icon);
									item.onClick(() => {
										range_type_filter = index;
									});
								});
							});

							menu.showAtMouseEvent(e);
						}}
						class='clickable-icon nav-action-button'
						bind:value={range_type_filter}
						states={range_filters}
					/>
					<Button class='clickable-icon nav-action-button' icon='lasso' tooltip='Select all markup' onClick={() => {
						selected_ranges = Array.from(flattened_ranges.keys());
						anchor_selected_range = 0;
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
				<div class='criticmarkup-view-info'>
					<span>{flattened_ranges.length} {filter_names[range_type_filter]} in the {location_filters[location_filter].tooltip.toLowerCase()}</span>
					{#if selected_ranges.length}
						<span> · {selected_ranges.length} selected</span>
					{/if}
				</div>
			</svelte:fragment>
		</NavHeader>
	</svelte:fragment>

	<svelte:fragment slot='view'>
		<div class='criticmarkup-view-container' tabindex='-1' on:click={onClickOutside} on:keydown={handleKey}>
			<VirtualList items={flattened_ranges} let:item let:index>
				<div class='criticmarkup-view-range'
					 class:criticmarkup-view-range-completed={item.range.fields.done}
					 class:criticmarkup-view-range-selected={selected_ranges.some(value => value === index)}
					 on:mouseenter={() => hover_index = index}
					 on:mouseleave={() => hover_index = null}
					 on:click|stopPropagation={async (e) => {
							if (e.shiftKey) {
								if (anchor_selected_range) {
									const start = Math.min(anchor_selected_range, index);
									const end = Math.max(anchor_selected_range, index);
									selected_ranges = Array.from({length: end - start + 1}, (_, i) => i + start);
								} else {
									selected_ranges = [index];
									anchor_selected_range = index;
								}
							} else if (e.ctrlKey || e.metaKey) {
								anchor_selected_range = index;
								const original_length = selected_ranges.length;
								selected_ranges = selected_ranges.filter((value) => value !== index);
								if (selected_ranges.length === original_length)
									selected_ranges = [...selected_ranges, index];
							} else {
								selected_ranges = [];
								const leaves = plugin.app.workspace.getLeavesOfType("markdown");
								if (!leaves.length) return;
								const lastActiveLeaf = leaves.reduce((a, b) => (a.activeTime > b.activeTime) ? a : b);

								const file = plugin.app.vault.getAbstractFileByPath(item.path);
								if (!file) return;
								const view = lastActiveLeaf.view;

								if (file !== view.file)
									await lastActiveLeaf.openFile(file);

								view.editor.setSelection(view.editor.offsetToPos(item.range.from), view.editor.offsetToPos(item.range.to));
							}
						}}
					 on:contextmenu={(e) => {
							const menu = new Menu();
							menu.addItem((m_item) => {
								m_item.setTitle("Accept" + (selected_ranges.length ? " selected changes" : " changes"));
								m_item.setIcon("check");
								m_item.onClick(async () => editSelectedRanges(true, index));
							});
							menu.addItem((m_item) => {
								m_item.setTitle("Reject" + (selected_ranges.length ? " selected changes" : " changes"));
								m_item.setIcon("cross");
								m_item.onClick(async () => editSelectedRanges(false, index));
							});

							menu.showAtMouseEvent(e);
						}}
				>
					{#if hover_index === index}
						<div style='position: relative'>
							<div class='criticmarkup-view-suggestion-buttons' >
								<Button icon='check' tooltip='Accept change' onClick={() => editSelectedRanges(true, index)} />
								<Button icon='cross' tooltip='Reject change' onClick={() => editSelectedRanges(false, index)} />
							</div>
						</div>
					{/if}


					<!-- TODO: Only show path if folder/vault-wide filter is active -->
					<div class='criticmarkup-view-range-top'>
						<Icon size={24} icon={SUGGESTION_ICON_MAPPER[item.range.type]} />
						<div>
							<span class='criticmarkup-view-range-title'>{item.path}</span>
							<div>
								{#if item.range.fields.author}
								<span class='criticmarkup-view-range-author'>
									{item.range.fields.author}
								</span>
								{/if}

								{#if item.range.fields.time}
								<span class='criticmarkup-view-range-time'>
									{window.moment.unix(item.range.fields.time).format('MMM DD YYYY, HH:mm')}
								</span>
								{/if}
							</div>
						</div>
					</div>

					{#key item.range.text}
						<div class='criticmarkup-view-range-text'>
							{#if item.range.empty()}
								<span class='criticmarkup-view-range-empty'>This range is empty</span>
							{:else}
								{@const parts = item.range.unwrap_parts()}
								<MarkdownRenderer {plugin} text={parts[0]} source={item.path} class={item.range.fields.style} />
								{#if item.range.type === SuggestionType.SUBSTITUTION}
									<MarkdownRenderer {plugin} text={parts[1]} source={item.path} />
								{/if}
							{/if}
						</div>
					{/key}

					{#if item.range.replies.length}
						{#each item.range.replies as reply}
							<div class='criticmarkup-view-range-reply'>
								<div class='criticmarkup-view-range-reply-top'>
									{#if reply.fields.author}
										<span class='criticmarkup-view-range-reply-author'>
											{reply.fields.author}
										</span>
									{/if}
									{#if reply.fields.time}
										<span class='criticmarkup-view-range-reply-time'>
											{window.moment.unix(reply.fields.time).format('MMM DD YYYY, HH:mm')}
										</span>
									{/if}
								</div>
								<div class='criticmarkup-view-range-reply-text'>
									<MarkdownRenderer {plugin} text={reply.unwrap()} source={item.path} class={reply.fields.style} />
								</div>
							</div>
						{/each}
					{/if}
				</div>
			</VirtualList>
		</div>
	</svelte:fragment>
</View>
