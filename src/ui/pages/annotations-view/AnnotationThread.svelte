<script lang="ts">
    import type CommentatorPlugin from "../../../main";
    import { type CriticMarkupRangeEntry, SUGGESTION_ICON_MAPPER, SuggestionType } from "../../../editor/base";
    import { MarkdownRenderer, Icon } from "../../components";
    import {onContextMenu} from "./context-menu";
    import AnnotationThreadQuickActions from "./AnnotationThreadQuickActions.svelte";

    interface Props {
        plugin: CommentatorPlugin;
        selected_ranges: CriticMarkupRangeEntry[];
        row: CriticMarkupRangeEntry,
        index: number;
        onClick: (evt: MouseEvent, row: Row, index: number) => void;
        onDblClick: (evt: MouseEvent, row: Row, index: number) => void;
        menu_open: boolean;
    }

    let {
        plugin,
        selected_ranges,
        row,
        index,
        onClick,
		onDblClick,
		menu_open = $bindable(false),
    }: Props = $props();

    let is_focused = $state(false);
    let hovered_idx = $state<number | null>(null);
    let menu_open_at_idx = $state(null);

	function setHoveredIndex(idx: number) {
		if (!menu_open) {
            hovered_idx = idx;
            menu_open_at_idx = hovered_idx;
		}
	}

    let is_selected = $derived(selected_ranges.some((range) => range.path === row.path && range.range.from === row.range.from));

</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
		tabindex={index}
		class="cmtr-view-range"
		class:cmtr-view-range-completed={row.range.fields.done}
		class:cmtr-view-range-selected={is_selected}
		onmouseenter={() => { setHoveredIndex(0); }}
		onmouseleave={() => { setHoveredIndex(null); }}
		onclick={ (e) => { onClick(e, row, index); is_focused = true; } }
		onblur={() => { is_focused = false; }}
		ondblclick={(e) => { onDblClick(e, row, index); }}
		oncontextmenu={(e) => { onContextMenu(plugin, e, selected_ranges.length ? selected_ranges : [{path: row.path, range: row.range.thread[hovered_idx] ?? row.range}]) }}
>
	{#if (!menu_open && hovered_idx === 0) || (menu_open && menu_open_at_idx === 0)}
		<AnnotationThreadQuickActions
			plugin={plugin}
			entry={row}
			bind:menu_open={menu_open}
			moreOptionsMenu={onContextMenu}
		/>
	{/if}

	<!-- TODO: Only show path if folder/vault-wide filter is active -->
	<div class="cmtr-view-range-top">
		<Icon size={24} icon={SUGGESTION_ICON_MAPPER[row.range.type]} />
		<div>
			<span class="cmtr-view-range-title">{row.path}</span>
			<div>
				{#if row.range.fields.author}
                    <span class="cmtr-view-range-author">
                      {row.range.fields.author}
                    </span>
				{/if}

				{#if row.range.fields.time}
                    <span class="cmtr-view-range-time">
                      {window.moment
                          .unix(row.range.fields.time)
                          .format("MMM DD YYYY, HH:mm")}
                    </span>
				{/if}
			</div>
		</div>
	</div>

	{#key row.range.text}
		<div class="cmtr-view-range-text"
			 onmouseenter={() => { setHoveredIndex(0); }}
		>
			{#if row.range.empty()}
                  <p class="cmtr-view-range-empty">
					  This range is empty
				  </p>
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
		{#each row.range.replies as reply, idx}
			{#key reply.text}
				<div class="cmtr-view-range-reply"
					onmouseenter={() => { setHoveredIndex(idx + 1); }}
					class:cmtr-view-range-reply-hovered={hovered_idx === idx + 1}
				>
					{#if (!menu_open && hovered_idx === idx + 1) || (menu_open && menu_open_at_idx === idx + 1)}
						<AnnotationThreadQuickActions
							plugin={plugin}
							entry={{ path: row.path, range: reply }}
							bind:menu_open={menu_open}
							moreOptionsMenu={onContextMenu}
						/>
					{/if}

					<div class="cmtr-view-range-reply-top">
						{#if reply.fields.author}
                        <span class="cmtr-view-range-reply-author">
                          {reply.fields.author}
                        </span>
						{/if}
						{#if reply.fields.time}
                        <span class="cmtr-view-range-reply-time">
                          {window.moment
                              .unix(reply.fields.time)
                              .format("MMM DD YYYY, HH:mm")}
                        </span>
						{/if}
					</div>
					<div class="cmtr-view-range-reply-text">
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
