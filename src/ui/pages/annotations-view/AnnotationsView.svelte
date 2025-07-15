<script lang="ts">
    import type CommentatorPlugin from "../../../main";

    import {onDestroy, onMount} from "svelte";
    import {Icon, View, StateButton, NavHeader, Button, Input, VirtualList} from "../../components";
    import AnnotationThread from "./AnnotationThread.svelte";
    import type { CommentatorAnnotationsViewState } from "../../view.svelte"

    import {TFile, Menu, debounce} from "obsidian";

    import {type DatabaseEntry} from "../../../database";

    import {DaterangeModal} from "../../modals";
    import {openNoteAtRangeEntry, undoRangeEditsToVault} from "../../../editor/uix";
    import {type CriticMarkupRange, type CriticMarkupRangeEntry} from "../../../editor/base";
    import {filterRanges, AuthorFilter, ContentFilter, LocationFilter, SuggestionTypeFilter} from "./filter-ranges";
    import {stickyContextMenuPatch} from "../../../patches";
    import {menuSingleChoiceExclusive} from "../../../util/obsidian-util";

    interface Props {
        plugin: CommentatorPlugin;
        range_type_filter?: SuggestionTypeFilter;
        location_filter?: LocationFilter;
        content_filter?: ContentFilter;
        author_filter?: AuthorFilter;
        date_filter?: number[] | undefined;

        sync_props: (args: CommentatorAnnotationsViewState) => void;
    }

    let {
        plugin,
        range_type_filter = SuggestionTypeFilter.ALL,
        location_filter = LocationFilter.VAULT,
        content_filter = ContentFilter.ALL,
        author_filter = AuthorFilter.ALL,
        date_filter = undefined,

        sync_props
    }: Props = $props();

    let search_filter: string = $state("");
    let active_file: TFile | null = $state(null);
    const file_change_event = plugin.app.workspace.on(
        "layout-change",
        () => {
            active_file = plugin.app.workspace.getActiveFile();
        },
    );

    let menu_open = $state(false);

    let all_ranges: DatabaseEntry<CriticMarkupRange[]>[] = $state([]);
    let selected_ranges: CriticMarkupRangeEntry[] = $state([]);
    let anchor_selected_range: number | null = $state(null);

    const range_filters = [
        {icon: "asterisk", tooltip: "All markup", value: SuggestionTypeFilter.ALL},
        {icon: "plus-circle", tooltip: "Addition markup", value: SuggestionTypeFilter.ADDITION},
        {icon: "minus-square", tooltip: "Deletion markup", value: SuggestionTypeFilter.DELETION},
        {icon: "replace", tooltip: "Substitution markup", value: SuggestionTypeFilter.SUBSTITUTION},
        {icon: "highlighter", tooltip: "Highlight markup", value: SuggestionTypeFilter.HIGHLIGHT},
        {icon: "message-square", tooltip: "Comment markup", value: SuggestionTypeFilter.COMMENT},
    ];

    const filter_names = [
        "suggestions",
        "insertions",
        "deletions",
        "replacements",
        "highlights",
        "comments",
    ];

    const location_filters = [
        {icon: "vault", tooltip: "Entire vault", value: LocationFilter.VAULT},
        {icon: "folder-closed", tooltip: "Current folder", value: LocationFilter.FOLDER},
        {icon: "file", tooltip: "Current file", value: LocationFilter.FILE},
    ];

    const content_filters = [
        {icon: "maximize", tooltip: "All suggestions", value: ContentFilter.ALL},
        {icon: "square", tooltip: "Suggestions with content", value: ContentFilter.CONTENT},
        {icon: "box-select", tooltip: "Empty suggestions", value: ContentFilter.EMPTY},
    ];

    const author_filters = [
        {icon: "users", tooltip: "All suggestions", value: AuthorFilter.ALL},
        {icon: "user", tooltip: "Own suggestions", value: AuthorFilter.SELF},
        {icon: "user-x", tooltip: "Others' suggestions", value: AuthorFilter.OTHERS},
    ];

    onMount(() => {
        plugin.database.on("database-update", (ranges) => {
            all_ranges = ranges;
        });
        all_ranges = plugin.database.allEntries()!;
    });

    onDestroy(() => {
        plugin.app.workspace.offref(file_change_event);
    });

    let filtered_items = $derived(filterRanges(plugin, all_ranges, search_filter, location_filter, range_type_filter, content_filter, author_filter, date_filter, active_file));
    let description_blurb = $derived.by(() => {
        return `${filtered_items.length} ${filter_names[range_type_filter]} in the ${
            location_filters[active_file ? location_filter : LocationFilter.VAULT].tooltip.toLowerCase()
        }`;
    });

    const debouncedUpdate = debounce(filterRanges, 500);

    const save_view_state = debounce(
        () => {
            sync_props(
                {
                    range_type_filter,
                    location_filter,
                    content_filter,
                    author_filter,
                    date_filter,
                    search_filter,
                }
            );
            plugin.app.workspace.requestSaveLayout();
        },
        2500,
    );

    $effect(() => {
        range_type_filter;
        location_filter;
        content_filter;
        author_filter;
        date_filter;
        save_view_state()
    });

    $effect(() => {
        filtered_items;
        selected_ranges = [];
        anchor_selected_range = null;
    });

    async function handleThreadClick(e: MouseEvent, row: CriticMarkupRangeEntry, index: number) {
        e.stopPropagation();
        if (e.shiftKey) {
            if (anchor_selected_range) {
				selected_ranges = [...filtered_items].slice(
                    Math.min(anchor_selected_range, index),
                    Math.max(anchor_selected_range, index) + 1
				);
			} else {
                selected_ranges = [filtered_items[index]];
                anchor_selected_range = index;
            }
        } else if (e.ctrlKey || e.metaKey) {
            anchor_selected_range = index;
            const original_length = selected_ranges.length;
            const selected_item = filtered_items[index];
            selected_ranges = selected_ranges.filter(
				(item) => !(item.path === selected_item.path && item.range === selected_item.range)
			);
            if (selected_ranges.length === original_length) {
                selected_ranges = [...selected_ranges, selected_item];
			}
        }
    }

    async function handleThreadDblClick(e: MouseEvent, row: CriticMarkupRangeEntry, index: number) {
        e.stopPropagation();
        selected_ranges = [];
		await openNoteAtRangeEntry(plugin, row);
    }

    async function handleKey(e: KeyboardEvent) {
        if (e.key === "z" && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            // TODO: Undo history: retrieve previous selection?
            await undoRangeEditsToVault(plugin);
        } else if (e.key === "a" && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            selected_ranges = [...filtered_items];
            anchor_selected_range = 0;
        } else if (e.key === "Escape") {
            e.preventDefault();
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
	{#snippet header()}
		<NavHeader>
			{#snippet container()}
				<div class="cmtr-view-search search-input-container">
					<Input
						value={search_filter}
						type="text"
						enterkeyhint="search"
						placeholder={"Search..."}
						spellcheck={false}
						onChange={(value) => {
						  search_filter = value;
						  debouncedUpdate();
						}}
					/>
				</div>

				<div class="cmtr-view-action-container">
					<StateButton
						onContextMenu={(e) => {
						  let menu = new Menu();

						  range_filters.map((filter, index) => {
							menu.addItem((item) => {
							  item
								.setTitle(filter.tooltip)
								.setIcon(filter.icon)
								.onClick(() => {
								  range_type_filter = index;
								});
							});
						  });

						  menu.showAtMouseEvent(e);
						}}
						class="cmtr-view-action clickable-icon nav-action-button"
						bind:value={range_type_filter}
						states={range_filters}
					/>
					<StateButton
						onContextMenu={(e) => {
						  let menu = new Menu();

						  location_filters.map((filter, index) => {
							menu.addItem((item) => {
							  item
								.setTitle(filter.tooltip)
								.setIcon(filter.icon)
								.onClick(() => {
								  location_filter = index;
								});
							});
						  });

						  menu.showAtMouseEvent(e);
						}}
						class="cmtr-view-action clickable-icon nav-action-button"
						bind:value={location_filter}
						states={location_filters}
					/>
					<StateButton
						onContextMenu={(e) => {
						  let menu = new Menu();

						  content_filters.map((filter, index) => {
							menu.addItem((item) => {
							  item
								.setTitle(filter.tooltip)
								.setIcon(filter.icon)
								.onClick(() => {
								  content_filter = index;
								});
							});
						  });

						  menu.showAtMouseEvent(e);
						}}
						class="cmtr-view-action clickable-icon nav-action-button"
						bind:value={content_filter}
						states={content_filters}
					/>
					{#if plugin.settings.enable_metadata}
						{#if plugin.settings.enable_author_metadata}
							<StateButton
								onContextMenu={(e) => {
								  let menu = new Menu();

								  author_filters.map((filter, index) => {
									menu.addItem((item) => {
									  item
										.setTitle(filter.tooltip)
										.setIcon(filter.icon)
										.onClick(() => {
										  author_filter = index;
										});
									});
								  });

								  menu.showAtMouseEvent(e);
								}}
								class="cmtr-view-action clickable-icon nav-action-button"
								bind:value={author_filter}
								states={author_filters}
							/>
						{/if}

						{#if plugin.settings.enable_timestamp_metadata}
							<!--FIXME: Dropping console.log statements from build since this component added some-->
							<button
								class="cmtr-view-action clickable-icon nav-action-button svelcomlib-icon-text"
								aria-label="Filter by date"
								onclick={() =>
								  new DaterangeModal(plugin, date_filter, (val) => {
									date_filter = val?.map((date) =>
									  date
										? window.moment(date, "YYYY-MM-DD HH:mm:ss").unix()
										: 0,
									);
								  }).open()
								}
								oncontextmenu={(e) => {
								  e.preventDefault();
								  const menu = new Menu();
								  menu.addItem((item) => {
									item
									  .setTitle("Clear date filter")
									  .setIcon("calendar-x")
									  .onClick(() => {
										date_filter = undefined;
									  });
								  });
								  menu.addItem((item) => {
									item
									  .setTitle("Filter to today")
									  .setIcon("calendar-days")
									  .onClick(() => {
										const today = window.moment().startOf("day").unix();
										date_filter = [today, today + 86400];
									  });
								  });
								  menu.addItem((item) => {
									item
									  .setTitle("Filter to this week")
									  .setIcon("calendar-range")
									  .onClick(() => {
										const today = window.moment().startOf("day").unix();
										date_filter = [
										  today - window.moment().day() * 86400,
										  today + (7 - window.moment().day()) * 86400,
										];
									  });
								  });
								  menu.addItem((item) => {
									item
									  .setTitle("Filter to this month")
									  .setIcon("calendar-clock")
									  .onClick(() => {
										const today = window.moment().startOf("day").unix();
										date_filter = [
										  today - window.moment().date() * 86400,
										  today +
											(window.moment().daysInMonth() -
											  window.moment().date()) *
											  86400,
										];
									  });
									  });
								  menu.showAtMouseEvent(e);
								}}
								>
								<Icon icon="calendar"/>
							</button>
						{/if}
					{/if}

					<!--<div class="cmtr-view-action-sep"></div>-->

					<Button
							class="clickable-icon nav-action-button cmtr-view-action"
							icon="more-vertical"
							tooltip="More options"
							onClick={(evt) => {
							  	stickyContextMenuPatch(true);
                                const menu = new Menu();

								menu.addItem((item) => {
									item
										.setTitle("Clear filters")
										.setIcon("filter-x")
										.setSection("filter-actions")
										.onClick(() => {
											range_type_filter = SuggestionTypeFilter.ALL;
											location_filter = LocationFilter.VAULT;
											content_filter = ContentFilter.ALL;
											author_filter = AuthorFilter.ALL;
											date_filter = undefined;
											search_filter = "";
										});
								});

								menu.addItem((item) => {
									const submenu = item
										.setTitle("Filter by author")
										.setIcon("user-search")
										.setSection("filter-actions")
										.setSubmenu();
                                    menuSingleChoiceExclusive(submenu, author_filter, author_filters, (value) => { author_filter = value; });
								});

                                menu.addItem((item) => {
								  	const submenu = item
										.setTitle("Filter by type")
										.setIcon("space")
										.setSection("filter-actions")
										.setSubmenu();
									menuSingleChoiceExclusive(submenu, range_type_filter, range_filters, (value) => { range_type_filter = value; });
								});

                                menu.addItem((item) => {
								  	const submenu = item
										.setTitle("Filter by location")
										.setIcon("locate")
										.setSection("filter-actions")
										.setSubmenu();
									menuSingleChoiceExclusive(submenu, location_filter, location_filters, (value) => { location_filter = value; });
								});

                                menu.addItem((item) => {
								  	item
										.setTitle("Filter by date")
										.setIcon("calendar")
										.setSection("filter-actions")
										.onClick(() => {
											new DaterangeModal(plugin, date_filter, (val) => {
												date_filter = val?.map((date) =>
													date
														? window.moment(date, "YYYY-MM-DD HH:mm:ss").unix()
														: 0,
												);
											}).open();
										});
								});

								menu.addItem((item) => {
								  item
									  .setTitle("Select all")
									  .setIcon("circle")
									  .setSection("selection-actions")
									  .onClick(async () => {
										  selected_ranges = [...filtered_items];
										  anchor_selected_range = 0;
									  });
								});
								menu.addItem((item) => {
								  item
									  .setTitle("Clear selection")
									  .setIcon("circle-dashed")
									  .setSection("selection-actions")
									  .onClick(() => {
										  selected_ranges = [];
										  anchor_selected_range = null;
									  });
								});
								menu.addItem((item) => {
								  item
									  .setTitle("Invert selection")
									  .setIcon("circle-alert")
									  .setSection("selection-actions")
									  .onClick(() => {
										  const sorted_ranges = [...selected_ranges].sort((a, b) => { a.range.from - b.range.from; });
										  const new_selection = [];
										  let current_idx = 0;
										  for (const [idx, row] of filtered_items.entries()) {
											  if (current_idx < sorted_ranges.length && row.path === sorted_ranges[current_idx].path && row.range.from === sorted_ranges[current_idx].range.from) {
												  current_idx++;
											  } else {
												  new_selection.push(row);
											  }
										  }
										  selected_ranges = new_selection;
										  anchor_selected_range = null;
									  });
								});

                                	menu.addItem((item) => {
								  item
									  .setTitle("Undo change")
									  .setIcon("undo")
									  .setSection("history-actions")
									  .setDisabled(!plugin.file_history.length)
									  .onClick(() => {
										  undoRangeEditsToVault(plugin);
									  });
								});

								menu.showAtMouseEvent(evt);
							}}
					/>
				</div>
				<div class="cmtr-view-info">
				  <span>{description_blurb}</span>
					{#if selected_ranges.length}
						<span> · {selected_ranges.length} selected</span>
					{/if}
				</div>
			{/snippet}
		</NavHeader>
	{/snippet}

	{#snippet view()}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
				class="cmtr-view-container"
				tabindex="-1"
				onclick={onClickOutside}
				onkeydown={handleKey}
		>
			<VirtualList items={filtered_items}>
				{#snippet item(row, index)}
					<AnnotationThread
							plugin={plugin}
							selected_ranges={selected_ranges}
							row={row}
							index={index}
							onClick={handleThreadClick}
							onDblClick={handleThreadDblClick}
							bind:menu_open={menu_open}
					/>
				{/snippet}
			</VirtualList>
		</div>
	{/snippet}
</View>
