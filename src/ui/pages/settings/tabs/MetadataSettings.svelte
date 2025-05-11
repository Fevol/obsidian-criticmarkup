<script lang="ts">
  import { SettingItem, Toggle, Input } from "../../../components";

  import type CommentatorPlugin from "../../../../main";

  let { plugin }: { plugin: CommentatorPlugin } = $props();
</script>

<SettingItem name="Add Metadata" type="toggle">
  {#snippet control()}
    <Toggle
      value={plugin.settings.enable_metadata}
      onChange={(value) => {
        plugin.settings.enable_metadata = value;
        plugin.saveSettings();
      }}
    />
  {/snippet}
</SettingItem>

<SettingItem
  name="Enable Authorship"
  description="Enable rendering and processing of author metadata"
  type="toggle"
>
  {#snippet control()}
    <Toggle
      value={plugin.settings.enable_author_metadata}
      onChange={(value) => {
        plugin.settings.enable_author_metadata = value;
        plugin.saveSettings();
      }}
    />
  {/snippet}
</SettingItem>

{#if plugin.settings.enable_author_metadata}
  <SettingItem
    name="Add Author Metadata"
    description="Author metadata will be added into new suggestions and comments"
    type="toggle"
    depth={1}
  >
    {#snippet control()}
      <Toggle
        value={plugin.settings.add_author_metadata}
        onChange={(value) => {
          plugin.settings.add_author_metadata = value;
          plugin.saveSettings();
        }}
      />
    {/snippet}
  </SettingItem>

  <SettingItem name="Name" depth={1} >
    {#snippet control()}
      <Input
        type="text"
        bind:value={plugin.settings.author}
        onChange={(value) => {
          plugin.settings.author = value;
          plugin.saveSettings();
        }}
      />
    {/snippet}
  </SettingItem>
{/if}

<SettingItem
  name="Enable Timestamp"
  description="Enable rendering and processing of timestamp metadata"
  type="toggle"
>
  {#snippet control()}
    <Toggle
      value={plugin.settings.enable_timestamp_metadata}
      onChange={(value) => {
        plugin.settings.enable_timestamp_metadata = value;
        plugin.saveSettings();
      }}
    />
  {/snippet}
</SettingItem>

{#if plugin.settings.enable_timestamp_metadata}
  <SettingItem
    name="Add Timestamp Metadata"
    description="Timestamp metadata will be added into new suggestions and comments"
    depth={1}
  >
    {#snippet control()}
      <Toggle
        value={plugin.settings.add_timestamp_metadata}
        onChange={(value) => {
          plugin.settings.add_timestamp_metadata = value;
          plugin.saveSettings();
        }}
      />
    {/snippet}
  </SettingItem>
{/if}

<SettingItem
  name="Enable Completed"
  description="Enable rendering and processing of completed metadata"
  type="toggle"
>
  {#snippet control()}
    <Toggle
      value={plugin.settings.enable_completed_metadata}
      onChange={(value) => {
        plugin.settings.enable_completed_metadata = value;
        plugin.saveSettings();
      }}
    />
  {/snippet}
</SettingItem>

{#if plugin.settings.enable_completed_metadata}
  <SettingItem
    name="Add Completed Metadata"
    description="Completed metadata will be added into new suggestions and comments"
    depth={1}
  >
    {#snippet control()}
      <Toggle
        value={plugin.settings.add_completed_metadata}
        onChange={(value) => {
          plugin.settings.add_completed_metadata = value;
          plugin.saveSettings();
        }}
      />
    {/snippet}
  </SettingItem>
{/if}

<SettingItem
  name="Enable Style"
  description="Enable rendering and processing of style metadata"
  type="toggle"
>
  {#snippet control()}
    <Toggle
      value={plugin.settings.enable_style_metadata}
      onChange={(value) => {
        plugin.settings.enable_style_metadata = value;
        plugin.saveSettings();
      }}
    />
  {/snippet}
</SettingItem>

{#if plugin.settings.enable_style_metadata}
  <SettingItem
    name="Add Style Metadata"
    description="Style metadata will be added into new suggestions and comments"
    depth={1}
  >
    {#snippet control()}
      <Toggle
        value={plugin.settings.add_style_metadata}
        onChange={(value) => {
          plugin.settings.add_style_metadata = value;
          plugin.saveSettings();
        }}
      />
    {/snippet}
  </SettingItem>
{/if}

<SettingItem
  name="Enable Color"
  description="Enable rendering and processing of color metadata"
  type="toggle"
>
  {#snippet control()}
    <Toggle
      value={plugin.settings.enable_color_metadata}
      onChange={(value) => {
        plugin.settings.enable_color_metadata = value;
        plugin.saveSettings();
      }}
    />
  {/snippet}
</SettingItem>

{#if plugin.settings.enable_color_metadata}
  <SettingItem
    name="Add Color Metadata"
    description="Color metadata will be added into new suggestions and comments"
    depth={1}
  >
    {#snippet control()}
      <Toggle
        value={plugin.settings.add_color_metadata}
        onChange={(value) => {
          plugin.settings.add_color_metadata = value;
          plugin.saveSettings();
        }}
      />
    {/snippet}
  </SettingItem>
{/if}
