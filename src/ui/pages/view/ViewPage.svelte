<script lang="ts">
  import type CommentatorPlugin from "../../../main";

  import { onDestroy, onMount } from "svelte";
  import {
    MarkdownRenderer,
    Icon,
    View,
    StateButton,
    NavHeader,
    Button,
    Input,
    VirtualList,
  } from "../../components";

  import {
    type TFile,
    Menu,
    debounce,
    prepareSimpleSearch,
    Notice,
  } from "obsidian";

  import { type DatabaseEntry } from "../../../database";

  import {
    SuggestionType,
    SUGGESTION_ICON_MAPPER,
    type CriticMarkupRange,
    type CommentRange,
    acceptSuggestionsInFile,
    rejectSuggestionsInFile,
  } from "../../../editor/base";
  import { DaterangeModal } from "../../modals";

  const enum SuggestionTypeFilter { ALL, ADDITION, DELETION, SUBSTITUTION, HIGHLIGHT, COMMENT }
  const enum LocationFilter { VAULT, FOLDER, FILE }
  const enum ContentFilter { ALL, CONTENT, EMPTY }
  const enum AuthorFilter { ALL, SELF, OTHERS }
  type RangeEntry = { path: string; range: CriticMarkupRange };

  interface Props {
    plugin: CommentatorPlugin;
    range_type_filter?: SuggestionTypeFilter;
    location_filter?: LocationFilter;
    content_filter?: ContentFilter;
    author_filter?: AuthorFilter;
    date_filter?: number[] | undefined;
  }

  let {
    plugin,
    range_type_filter = SuggestionTypeFilter.ALL,
    location_filter = LocationFilter.VAULT,
    content_filter = ContentFilter.ALL,
    author_filter = AuthorFilter.ALL,
    date_filter = undefined,
  }: Props = $props();

  let search_filter: string = $state("");
  let active_file: TFile | null = $state(null);
  const file_change_event = plugin.app.workspace.on(
    "active-leaf-change",
    () => {
      active_file = plugin.app.workspace.getActiveFile();
    },
  );

  let all_ranges: DatabaseEntry<CriticMarkupRange[]>[] = $state([]);
  let selected_ranges: number[] = $state([]);
  let anchor_selected_range: number | null = $state(null);
  let hover_index: number | null = $state(null);

  const range_filters = [
    { icon: "asterisk", tooltip: "All markup" },
    { icon: "plus-circle", tooltip: "Addition markup" },
    { icon: "minus-square", tooltip: "Deletion markup" },
    { icon: "replace", tooltip: "Substitution markup" },
    { icon: "highlighter", tooltip: "Highlight markup" },
    { icon: "message-square", tooltip: "Comment markup" },
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
    { icon: "vault", tooltip: "Entire vault" },
    { icon: "folder-closed", tooltip: "Current folder" },
    { icon: "file", tooltip: "Current file" },
  ];

  const content_filters = [
    { icon: "maximize", tooltip: "All suggestions" },
    { icon: "square", tooltip: "Only suggestions with content" },
    { icon: "box-select", tooltip: "Only empty suggestions" },
  ];

  const author_filters = [
    { icon: "users", tooltip: "All authors" },
    { icon: "user", tooltip: "Only my suggestions" },
    { icon: "user-x", tooltip: "Only others' suggestions" },
  ];

  const undo_history: {
    file_history: Record<string, string>;
    selected_ranges: number[];
  }[] = [];

  onMount(() => {
    plugin.database.on("database-update", (ranges) => { all_ranges = ranges; });
    all_ranges = plugin.database.allEntries()!;
  });

  onDestroy(() => {
    plugin.app.workspace.offref(file_change_event);
  });

  let filtered_items = $derived(filterRanges(all_ranges, location_filter, range_type_filter, content_filter, author_filter, date_filter))!;
  let description_blurb = $derived.by(() => {
    return `${filtered_items.length} ${filter_names[range_type_filter]} in the ${
      location_filters[active_file ? location_filter : LocationFilter.VAULT].tooltip.toLowerCase()
    }`;
  });

  const debouncedUpdate = debounce(filterRanges, 500);

  $effect(() => {
    active_file;
    settingChanged();
  });

  const save_view_state = debounce(
          () => plugin.app.workspace.requestSaveLayout(),
          2500,
  );

  $effect(() => {
    range_type_filter; location_filter; content_filter; author_filter; date_filter;
    save_view_state()
    settingChanged();
  });

  function settingChanged() {
    selected_ranges = [];
    anchor_selected_range = null;
  }

  function filterRanges(
          items?: DatabaseEntry<CriticMarkupRange[]>[],
          location_filter?: LocationFilter, range_type_filter?: SuggestionTypeFilter, content_filter?: ContentFilter,
          author_filter?: AuthorFilter, date_filter?: number[]
  ) {
    if (!items) return;
    let basic_ranges = items;

    // Filter by location (vault, folder, file)
    if (location_filter !== LocationFilter.VAULT) {
      const active_file = plugin.app.workspace.getActiveFile();
      if (active_file) {
        if (location_filter === LocationFilter.FOLDER)
            basic_ranges = items.filter(([key, _]) =>
            key.startsWith(active_file.parent?.path ?? ""),
          );
        else if (location_filter === LocationFilter.FILE)
            basic_ranges = items.filter(([key, _]) => key === active_file.path);
      }
    }

    let filtered_ranges = basic_ranges.flatMap(([path, value]) =>
        value.data.map((range) => {
            return { path, range };
        }),
    );

    filtered_ranges = filtered_ranges.filter(
        (item) =>
            item.range.type !== SuggestionType.COMMENT ||
            !(item.range as CommentRange).attached_comment,
    );

    // Filter by type (addition, deletion, etc.)
    if (range_type_filter !== SuggestionTypeFilter.ALL)
        filtered_ranges = filtered_ranges.filter(
        (item) =>
          item.range.type ===
          Object.values(SuggestionType)[range_type_filter - 1],
      );

    // Filter by content (empty or not)
    if (content_filter !== ContentFilter.ALL)
        filtered_ranges = filtered_ranges.filter(
        (item) =>
          (content_filter === ContentFilter.CONTENT) !== item.range.empty(),
      );

    // Filter by metadata
    if (plugin.settings.enable_metadata) {

      // Filter by author metadata
      if (
        plugin.settings.enable_author_metadata &&
        author_filter !== AuthorFilter.ALL &&
        plugin.settings.author
      ) {
        if (author_filter === AuthorFilter.SELF)
            filtered_ranges = filtered_ranges.filter(
            (item) => item.range.fields.author === plugin.settings.author,
          );
        else if (author_filter === AuthorFilter.OTHERS)
            filtered_ranges = filtered_ranges.filter(
            (item) => item.range.fields.author !== plugin.settings.author,
          );
      }

      // Filter by date metadata
      if (plugin.settings.enable_timestamp_metadata && date_filter) {
        if (date_filter[0] && date_filter[1]) {
            filtered_ranges = filtered_ranges.filter(
            (item) =>
              item.range.fields.time &&
              item.range.fields.time >= date_filter![0] &&
              item.range.fields.time <= date_filter![1],
          );
        } else if (date_filter[0]) {
            filtered_ranges = filtered_ranges.filter(
            (item) =>
              item.range.fields.time &&
              item.range.fields.time >= date_filter![0],
          );
        } else if (date_filter[1]) {
            filtered_ranges = filtered_ranges.filter(
            (item) =>
              item.range.fields.time &&
              item.range.fields.time <= date_filter![1],
          );
        }
      }
    }

    // Filter by search terms
    if (search_filter.length) {
        filtered_ranges = filtered_ranges.filter(
              (item) => prepareSimpleSearch(search_filter)(item.range.text)?.score,
      );
    }

    return filtered_ranges;
  }

  async function editSelectedRanges(accept: boolean, entry: number | null) {
    if (entry != null && !selected_ranges.length) {
      selected_ranges = [entry];
      anchor_selected_range = entry;
    }
    const current_ranges = selected_ranges.map(
      (value) => filtered_items[value],
    );

    const grouped_ranges = current_ranges.reduce(
      (acc: Record<string, CriticMarkupRange[]>, { path, range }) => {
        if (!acc[path]) acc[path] = [];
        acc[path].push(range);
        return acc;
      },
      {},
    );

    const editFunction = accept
      ? acceptSuggestionsInFile
      : rejectSuggestionsInFile;

    const file_history: Record<string, string> = {};
    for (const [key, value] of Object.entries(grouped_ranges)) {
      const file = plugin.app.vault.getAbstractFileByPath(key);
      if (!file) continue;
      file_history[key] = await plugin.app.vault.cachedRead(<TFile>file);
      await editFunction(plugin.app, <TFile>file, value);
    }
    undo_history.push({ file_history, selected_ranges });
    selected_ranges = [];
  }

  async function handleKey(e: KeyboardEvent) {
    if (e.key === "z" && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
      if (undo_history.length) {
        const undo_history_entry = undo_history.pop()!;
        selected_ranges = undo_history_entry.selected_ranges;
        for (const [key, value] of Object.entries(
          undo_history_entry.file_history,
        )) {
          const file = plugin.app.vault.getAbstractFileByPath(key);
          if (!file) continue;
          await plugin.app.vault.modify(<TFile>file, value);
        }
      } else {
        new Notice("There is nothing to undo", 4000);
      }
    } else if (
      e.key === "a" &&
      e.ctrlKey &&
      !e.shiftKey &&
      !e.altKey &&
      !e.metaKey
    ) {
      selected_ranges = Array.from(filtered_items.keys());
      anchor_selected_range = 0;
    } else if (e.key === "Escape") {
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
        <div class="commentator-view-search search-input-container">
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

        <div style="display: flex">
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
            class="clickable-icon nav-action-button"
            bind:value={range_type_filter}
            states={range_filters}
          />
          <Button
            class="clickable-icon nav-action-button"
            icon="lasso"
            tooltip="Select all markup"
            onClick={() => {
              selected_ranges = Array.from(filtered_items.keys());
              anchor_selected_range = 0;
            }}
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
            class="clickable-icon nav-action-button"
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
            class="clickable-icon nav-action-button"
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
                class="clickable-icon nav-action-button"
                bind:value={author_filter}
                states={author_filters}
              />
            {/if}

            {#if plugin.settings.enable_timestamp_metadata}
              <!--FIXME: Dropping console.log statements from build since this component added some-->
              <button
                class="clickable-icon nav-action-button svelcomlib-icon-text"
                aria-label="Filter by date"
                onclick={() =>
                  new DaterangeModal(plugin, date_filter, (val) => {
                    date_filter = val?.map((date) =>
                      date
                        ? window.moment(date, "YYYY-MM-DD HH:mm:ss").unix()
                        : 0,
                    );
                  }).open()}
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
                <Icon icon="calendar" />
              </button>
            {/if}
          {/if}
        </div>
        <div class="criticmarkup-view-info">
          <span>{description_blurb}</span
          >
          {#if selected_ranges.length}
            <span> · {selected_ranges.length} selected</span>
          {/if}
        </div>
      {/snippet}
    </NavHeader>
  {/snippet}

  {#snippet view()}
    <div
      class="criticmarkup-view-container"
      tabindex="-1"
      onclick={onClickOutside}
      onkeydown={handleKey}
    >
      <VirtualList items={filtered_items}>
        {#snippet item(row, index)}
          <div
            class="criticmarkup-view-range"
            class:criticmarkup-view-range-completed={row.range.fields.done}
            class:criticmarkup-view-range-selected={selected_ranges.some(
              (value) => value === index,
            )}
            onmouseenter={() => (hover_index = index)}
            onmouseleave={() => (hover_index = null)}
            onclick={async (e) => {
              e.stopPropagation();
              if (e.shiftKey) {
                if (anchor_selected_range) {
                  const start = Math.min(anchor_selected_range, index);
                  const end = Math.max(anchor_selected_range, index);
                  selected_ranges = Array.from(
                    { length: end - start + 1 },
                    (_, i) => i + start,
                  );
                } else {
                  selected_ranges = [index];
                  anchor_selected_range = index;
                }
              } else if (e.ctrlKey || e.metaKey) {
                anchor_selected_range = index;
                const original_length = selected_ranges.length;
                selected_ranges = selected_ranges.filter(
                  (value) => value !== index,
                );
                if (selected_ranges.length === original_length)
                  selected_ranges = [...selected_ranges, index];
              } else {
                selected_ranges = [];
                const leaves = plugin.app.workspace.getLeavesOfType("markdown");
                if (!leaves.length) return;
                const lastActiveLeaf = leaves.reduce((a, b) =>
                  a.activeTime > b.activeTime ? a : b,
                );

                const file = plugin.app.vault.getAbstractFileByPath(row.path);
                if (!file) return;
                const view = lastActiveLeaf.view;

                if (file !== view.file) await lastActiveLeaf.openFile(file);

                view.editor.setSelection(
                  view.editor.offsetToPos(row.range.from),
                  view.editor.offsetToPos(row.range.to),
                );
              }
            }}
            oncontextmenu={(e) => {
              const menu = new Menu();
              menu.addItem((item) => {
                item
                  .setTitle(
                    "Accept" +
                      (selected_ranges.length ? " selected changes" : " changes"),
                  )
                  .setIcon("check")
                  .onClick(async () => editSelectedRanges(true, index));
              });
              menu.addItem((item) => {
                item
                  .setTitle(
                    "Reject" +
                      (selected_ranges.length ? " selected changes" : " changes"),
                  )
                  .setIcon("cross")
                  .onClick(async () => editSelectedRanges(false, index));
              });

              menu.showAtMouseEvent(e);
            }}
          >
            {#if hover_index === index}
              <div style="position: relative">
                <div class="criticmarkup-view-suggestion-buttons">
                  <Button
                    icon="check"
                    tooltip="Accept change"
                    onClick={() => editSelectedRanges(true, index)}
                  />
                  <Button
                    icon="cross"
                    tooltip="Reject change"
                    onClick={() => editSelectedRanges(false, index)}
                  />
                </div>
              </div>
            {/if}

            <!-- TODO: Only show path if folder/vault-wide filter is active -->
            <div class="criticmarkup-view-range-top">
              <Icon size={24} icon={SUGGESTION_ICON_MAPPER[row.range.type]} />
              <div>
                <span class="criticmarkup-view-range-title">{row.path}</span>
                <div>
                  {#if row.range.fields.author}
                    <span class="criticmarkup-view-range-author">
                      {row.range.fields.author}
                    </span>
                  {/if}

                  {#if row.range.fields.time}
                    <span class="criticmarkup-view-range-time">
                      {window.moment
                        .unix(row.range.fields.time)
                        .format("MMM DD YYYY, HH:mm")}
                    </span>
                  {/if}
                </div>
              </div>
            </div>

            {#key row.range.text}
              <div class="criticmarkup-view-range-text">
                {#if row.range.empty()}
                  <span class="criticmarkup-view-range-empty"
                    >This range is empty</span
                  >
                {:else}
                  {@const parts = row.range.unwrap_parts()}
                  <MarkdownRenderer
                    {plugin}
                    text={parts[0]}
                    source={row.path}
                    class={row.range.fields.style}
                  />
                  {#if row.range.type === SuggestionType.SUBSTITUTION}
                    <MarkdownRenderer
                      {plugin}
                      text={parts[1]}
                      source={row.path}
                    />
                  {/if}
                {/if}
              </div>
            {/key}

            {#if row.range.replies.length}
              {#each row.range.replies as reply}
                {#key reply.text}
                  <div class="criticmarkup-view-range-reply">
                    <div class="criticmarkup-view-range-reply-top">
                      {#if reply.fields.author}
                        <span class="criticmarkup-view-range-reply-author">
                          {reply.fields.author}
                        </span>
                      {/if}
                      {#if reply.fields.time}
                        <span class="criticmarkup-view-range-reply-time">
                          {window.moment
                            .unix(reply.fields.time)
                            .format("MMM DD YYYY, HH:mm")}
                        </span>
                      {/if}
                    </div>
                    <div class="criticmarkup-view-range-reply-text">
                      <MarkdownRenderer
                        {plugin}
                        text={reply.unwrap()}
                        source={row.path}
                        class={reply.fields.style}
                      />
                    </div>
                  </div>
                {/key}
              {/each}
            {/if}
          </div>
        {/snippet}
      </VirtualList>
    </div>
  {/snippet}
</View>
