<script lang="ts">
  import { SettingItem, Dropdown, Slider, Toggle } from "../../../components";

  import type CommentatorPlugin from "../../../../main";

  let { plugin }: { plugin: CommentatorPlugin } = $props();

  let comment_rendering_mode = $state(plugin.settings.comment_style);
  let comment_rendering_mode_notices = {
    inline:
      "Comments receive a background color and are fully visible (similar to suggestions)",
    icon: "Comments are displayed as icons and can be hovered over to reveal the comment",
    none: "Comments are not rendered in the editor, use this with the annotation gutter",
  };
</script>

<SettingItem name="Editing features" type="heading" />

<SettingItem
  name="Automatic tag completion"
  notices={[
    {
      type: "info",
      text: "When typing <code>{++</code>, the tag automatically gets completed with <code>++}</code>"
    },
  ]}
  type="toggle"
>
  {#snippet control()}
    <Toggle
      value={plugin.settings.tag_completion}
      onChange={() => {
        plugin.settings.tag_completion = !plugin.settings.tag_completion;
        plugin.saveSettings();
      }}
    />
  {/snippet}
</SettingItem>

<SettingItem
  name="Remove syntax on copy"
  description="When copying in the editor to the clipboard, any CriticMarkup syntax is removed"
  notices={[
    {
      type: "info",
      text: "Copying <code>my {++text++}</code> will result in <code>my text</code>"
    },
  ]}
  type="toggle"
>
  {#snippet control()}
    <Toggle
      slot="control"
      value={plugin.settings.clipboard_remove_syntax}
      onChange={() => {
        plugin.settings.clipboard_remove_syntax =
          !plugin.settings.clipboard_remove_syntax;
        plugin.saveSettings();
      }}
    />
  {/snippet}
</SettingItem>

<SettingItem
  name="Automatic tag correction"
  description="Dangling tags and redundant whitespaces automatically get removed to prevent invalid CriticMarkup syntax"
  type="toggle"
>
  {#snippet control()}
    <Toggle
      value={plugin.settings.tag_correcter}
      onChange={() => {
        plugin.settings.tag_correcter = !plugin.settings.tag_correcter;
        plugin.saveSettings();
      }}
    />
  {/snippet}
</SettingItem>

<!--<SettingItem-->
<!--	name="Edit Info"-->
<!--	description="Display a warning when editing a suggestion is not allowed due to editing rules"-->
<!--	type='toggle'-->
<!--&gt;-->
<!--	<Toggle-->
<!--		slot='control'-->
<!--		value={plugin.settings.edit_info}-->
<!--		onChange={() => {-->
<!--			plugin.settings.edit_info = !plugin.settings.edit_info;-->
<!--			plugin.saveSettings();-->
<!--		}}-->
<!--	/>-->
<!--</SettingItem>-->

<SettingItem
  name="Show style while editing"
  description="Keep the style of suggestions visible while editing"
  type="toggle"
>
  {#snippet control()}
    <Toggle
      value={plugin.settings.editor_styling}
      onChange={() => {
        plugin.settings.editor_styling = !plugin.settings.editor_styling;
        plugin.saveSettings();
      }}
    />
  {/snippet}
</SettingItem>

<SettingItem name="Comments Rendering" type="heading" />

<SettingItem
        name="Comment rendering mode"
        description="Determine how comments are rendered inside the editor"
        notices={[
    {
      type: "info",
      text: comment_rendering_mode_notices[comment_rendering_mode]
    },
  ]}
        type="dropdown"
>
  {#snippet control()}
    <Dropdown
      options={[
        { value: "inline", text: "Inline" },
        { value: "icon", text: "Icon" },
        { value: "none", text: "Hidden" },
      ]}
      value={comment_rendering_mode}
      onChange={(value) => {
        plugin.settings.comment_style = value;
        comment_rendering_mode = value;
        plugin.saveSettings();
      }}
    />
  {/snippet}
</SettingItem>
