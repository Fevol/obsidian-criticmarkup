<script lang="ts">
  import { Dropdown, SettingItem, Toggle } from "../../../components";

  import type CommentatorPlugin from "../../../../main";

  export let plugin: CommentatorPlugin;

  const suggestion_ranges = {
    addition: { icon: "plus-circle", tooltip: "Additions" },
    deletion: { icon: "minus-square", tooltip: "Deletions" },
    substitution: { icon: "replace", tooltip: "Substitutions" },
    highlight: { icon: "highlighter", tooltip: "Highlights" },
    comment: { icon: "message-square", tooltip: "Comments" },
  };

  const all_ranges = {
    "": { icon: "star", tooltip: "Regular" },
    ...suggestion_ranges,
  };

  const cursor_movement_options = [
    { value: "unchanged", text: "Regular movement" },
    { value: "ignore_bracket", text: "Skip brackets" },
    { value: "ignore_metadata", text: "Skip brackets and metadata" },
    { value: "ignore_completely", text: "Skip completely" },
  ];

  const bracket_movement_options = [
    { value: "unchanged", text: "Regular movement" },
    { value: "stay_inside", text: "Keep cursor within range" },
    { value: "stay_outside", text: "Treat range as word group" },
  ];
</script>

<SettingItem name="Functionality" type="heading" />

<SettingItem name="Suggestion mode" type="heading" depth={1} />

<SettingItem name="Cursor movement" type="heading" depth={2} />
{#each Object.keys(suggestion_ranges) as type}
  <SettingItem name={suggestion_ranges[type].tooltip} type="dropdown" depth={2}>
    <Dropdown
      slot="control"
      value={plugin.settings.suggestion_mode_operations.cursor_movement[type]}
      options={cursor_movement_options}
      onChange={(value) => {
        plugin.settings.suggestion_mode_operations.cursor_movement[type] =
          value;
        plugin.saveSettings();
      }}
    />
  </SettingItem>
{/each}

<SettingItem name="Bracket movement" type="heading" depth={2} />
{#each Object.keys(suggestion_ranges) as type}
  <SettingItem name={suggestion_ranges[type].tooltip} type="dropdown" depth={2}>
    <Dropdown
      slot="control"
      value={plugin.settings.suggestion_mode_operations.bracket_movement[type]}
      options={bracket_movement_options}
      onChange={(value) => {
        plugin.settings.suggestion_mode_operations.bracket_movement[type] =
          value;
        plugin.saveSettings();
      }}
    />
  </SettingItem>
{/each}

<SettingItem
  name="Suggestion mode cursor movement"
  description="Determine how the cursor should move through suggestions in suggestion mode"
  type="dropdown"
></SettingItem>

<SettingItem name="Rendering" type="heading" />

<SettingItem
  name="Live Preview renderer"
  description="Enable custom rendering of CriticMarkup syntax in Live Preview"
  type="toggle"
>
  <Toggle
    slot="control"
    value={plugin.settings.live_preview}
    onChange={() => {
      plugin.settings.live_preview = !plugin.settings.live_preview;
      plugin.saveSettings();
    }}
  />
</SettingItem>

<SettingItem
  name="Reading View renderer"
  description="Enable custom rendering of CriticMarkup syntax in Reading View"
  type="toggle"
>
  <Toggle
    slot="control"
    value={plugin.settings.post_processor}
    onChange={() => {
      plugin.settings.post_processor = !plugin.settings.post_processor;
      plugin.saveSettings();
    }}
  />
</SettingItem>
