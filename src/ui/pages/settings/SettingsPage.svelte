<script lang="ts">
  import CommentatorPlugin from "../../../main";

  import { slide } from "svelte/transition";

  import { Icon } from "../../components";
  import {
    GeneralSettings,
    EditorSettings,
    InterfaceSettings,
    AdvancedSettings,
    MetadataSettings,
    GutterSettings,
  } from "./tabs";

  let { plugin }: { plugin: CommentatorPlugin } = $props();


  let tabs = [
    { id: "general", name: "General", icon: "settings" },
    { id: "editor", name: "Editor", icon: "pencil" },
    { id: "interface", name: "Interface", icon: "layout-panel-top" },
    { id: "gutter", name: "Gutters", icon: "sidebar-open" },
    { id: "metadata", name: "Metadata", icon: "tags" },
    { id: "advanced", name: "Advanced", icon: "shield-alert" },
  ];
  let tab_idx = $state(tabs.findIndex((tab) => tab.id === plugin.settings_tab));
  let tab_id = $derived(tabs[tab_idx].id);
  let Component = $derived.by(() => {
    switch (tab_id) {
      case "general":
        return GeneralSettings;
      case "editor":
        return EditorSettings;
      case "gutter":
        return GutterSettings;
      case "advanced":
        return AdvancedSettings;
      case "interface":
        return InterfaceSettings;
      case "metadata":
        return MetadataSettings;
      default:
        return GeneralSettings;
    }
  })

  async function changedTabs(index: number) {
    tab_idx = index;
    tab_id = tabs[index].id;
    plugin.settings_tab = tab_id;
  }
</script>

<div>
  <nav
    class="cmtr-settings-navigation-bar"
    tabindex="0"
    onkeydown={(e) => {
      if (e.key === "Tab") {
        // FIXME: Prevent propagation of tab focus changing ONCE
        if (e.metaKey || e.ctrlKey) return true;
        else if (e.shiftKey)
          changedTabs(
            (((tab_idx - 1) % tabs.length) + tabs.length) % tabs.length,
          );
        else changedTabs((tab_idx + 1) % tabs.length);
        e.preventDefault();
      }
    }}
  >
    {#each tabs as { id, name, icon }, index}
      <div
        class:cmtr-settings-navigation-selected-item={tab_idx === index}
        class="cmtr-settings-navigation-item"
        aria-label={`${name} settings`}
        onclick={() => {
          changedTabs(index);
        }}
      >
        <div style="display: flex">
          <Icon {icon} />
        </div>
        <div
          class="cmtr-settings-navigation-item-text"
          class:cmtr-settings-navigation-selected-item-text={tab_idx !==
            index}
        >
          {name}
        </div>
      </div>
    {/each}
  </nav>

  {#key tab_id}
    <div in:slide={{ duration: 400, delay: 400 }} out:slide={{ duration: 400 }}>
      <Component plugin={plugin}/>
    </div>
  {/key}
</div>
