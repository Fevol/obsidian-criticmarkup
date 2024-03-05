<script lang="ts">
	import CommentatorPlugin from "../../../main";

	import {slide} from "svelte/transition";


	import { Icon } from '../../components';
	import { GeneralSettings, EditorSettings, InterfaceSettings, AdvancedSettings, MetadataSettings } from './tabs';

	export let plugin: CommentatorPlugin;

	let tabs = [
		{id: "general", name: "General", icon: "settings"},
		{id: "editor", name: "Editor", icon: "pencil"},
		{id: "interface", name: "Interface", icon: "layout"},
		{id: "advanced", name: "Advanced", icon: "shield-alert"},
		{id: "metadata", name: "Metadata", icon: "tags"}
	];
	let tab_idx = tabs.findIndex(tab => tab.id === plugin.settings_tab);
	let tab_id = tabs[tab_idx].id;

	function getComponent() {
		switch (tab_id) {
			case "general":
				return GeneralSettings;
			case "editor":
				return EditorSettings;
			case "advanced":
				return AdvancedSettings;
			case "interface":
				return InterfaceSettings;
			case "metadata":
				return MetadataSettings;
		}
	}

	async function changedTabs(index: number) {
		tab_idx = index;
		tab_id = tabs[index].id;
		plugin.settings_tab = tab_id;
	}
</script>

<div>
	<nav class="criticmarkup-settings-navigation-bar" tabindex="0"
		 on:keydown={e => {
			if (e.key === "Tab") {
				// FIXME: Prevent propagation of tab focus changing ONCE
				if (e.metaKey || e.ctrlKey)
					return true;
				else if (e.shiftKey)
					changedTabs((((tab_idx - 1) % tabs.length) + tabs.length) % tabs.length);
				else
					changedTabs((tab_idx + 1) % tabs.length);
				e.preventDefault();
			}
		}}
	>
		{#each tabs as {id, name, icon}, index}
			<div class:criticmarkup-settings-navigation-selected-item={tab_idx === index} class="criticmarkup-settings-navigation-item"
				 aria-label={`${name} settings`}
				 on:click={() => {
					 changedTabs(index)}
				 }
			>
				<div style="display: flex">
					<Icon icon="{icon}"/>
				</div>
				<div class="criticmarkup-settings-navigation-item-text" class:criticmarkup-settings-navigation-selected-item-text={tab_idx !== index}>{name}</div>
			</div>
		{/each}
	</nav>

	{#key tab_id}
		<div in:slide={{duration: 400, delay: 400}} out:slide={{duration: 400}}>
			<svelte:component
				this={getComponent()}
				plugin={plugin}
			/>
		</div>
	{/key}
</div>
