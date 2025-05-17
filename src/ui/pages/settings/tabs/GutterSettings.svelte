<script lang="ts">
    import {
        SettingItem,
        Slider,
        Toggle,
    } from "../../../components";

    import type CommentatorPlugin from "../../../../main";
    import {AnnotationInclusionType} from "../../../../constants";

    let { plugin }: { plugin: CommentatorPlugin } = $props();
</script>

<SettingItem
        name="Diff gutter"
        type="heading"
/>

<SettingItem
        name="Enable diff gutter"
        description="Display a gutter in the editor for showing changes from suggestions"
        notices={[
            {
              type: "info",
              text: "Clicking on the gutter reveals a menu for accepting/rejecting all changes within the block",
            },
        ]}
        type="toggle"
>
    {#snippet control()}
        <Toggle
            slot="control"
            value={plugin.settings.diff_gutter}
            onChange={() => {
                plugin.settings.diff_gutter = !plugin.settings.diff_gutter;
                plugin.saveSettings();
            }}
        />
    {/snippet}
</SettingItem>

<SettingItem
        name="Hide when empty"
        description="When enabled, the gutter will not take up any space when there are no changes in the current note"
        notices={[{ type: "info", text: "When enabled, switching between different notes may cause content to shift" }]}
        type="toggle"
        depth={1}
>
    {#snippet control()}
        <Toggle
            slot="control"
            value={plugin.settings.diff_gutter_hide_empty}
            onChange={() => {
                plugin.settings.diff_gutter_hide_empty =
                  !plugin.settings.diff_gutter_hide_empty;
                plugin.saveSettings();
            }}
        />
    {/snippet}
</SettingItem>

<SettingItem
    name="Annotation gutter"
    type="heading"
/>

<SettingItem
        name="Enable annotation gutter"
        description="Display a gutter in the editor for annotations"
        type="toggle"
>
    {#snippet control()}
        <Toggle
            value={plugin.settings.annotation_gutter}
            onChange={() => {
                plugin.settings.annotation_gutter = !plugin.settings.annotation_gutter;
                plugin.saveSettings();
            }}
        />
    {/snippet}
</SettingItem>


<SettingItem
        name="Included annotations"
        description="Determine which annotations should be shown by default"
        notices={[{ type: "info", text: "This setting only applies after reloading the app" }]}
        type="subheading"
        depth={1}
/>
{#each Object.keys(AnnotationInclusionType).filter(key => isNaN(Number(key))) as key, idx}
        <SettingItem
            name={key.toLowerCase().replace(/\b\w/g, s => s.toUpperCase())}
            type="toggle"
            depth={2}
        >
            {#snippet control()}
                <Toggle
                    value={(plugin.settings.annotation_gutter_included_types & AnnotationInclusionType[key]) !== 0}
                    onChange={() => {
                        plugin.settings.annotation_gutter_included_types ^= AnnotationInclusionType[key];
                        plugin.saveSettings();
                    }}
                />
            {/snippet}
        </SettingItem>
{/each}

<SettingItem
        name="Focus annotation on selection"
        description="When selecting an annotation in the editor, the corresponding annotation in the gutter will be focused"
        type="toggle"
        depth={1}
>
    {#snippet control()}
        <Toggle
                value={plugin.settings.annotation_gutter_focus_on_click}
                onChange={() => {
                plugin.settings.annotation_gutter_focus_on_click =
                  !plugin.settings.annotation_gutter_focus_on_click;
                plugin.saveSettings();
            }}
        />
    {/snippet}
</SettingItem>

<SettingItem
        name="Width"
        description="The width of the gutter in pixels"
        type="slider"
        depth={1}
>
    {#snippet control()}
        <Slider
            min={100}
            max={500}
            step={50}
            value={plugin.settings.annotation_gutter_width}
            onChange={(value) => {
                plugin.settings.annotation_gutter_width = value;
                plugin.saveSettings();
            }}
        />
    {/snippet}
</SettingItem>

<SettingItem
        name="Show resize handle"
        description="Display a handle bar within the editor for quickly resizing the gutter"
        type="toggle"
        depth={1}
>
    {#snippet control()}
        <Toggle
            value={plugin.settings.annotation_gutter_resize_handle}
            onChange={() => {
                plugin.settings.annotation_gutter_resize_handle =
                  !plugin.settings.annotation_gutter_resize_handle;
                plugin.saveSettings();
            }}
        />
    {/snippet}
</SettingItem>

<SettingItem
        name="Default fold state"
        description="Determine whether the gutter is shown by default"
        notices={[{ type: "info", text: "This setting only applies after reloading the app" }]}
        type="toggle"
        depth={1}
>
    {#snippet control()}
        <Toggle
            value={plugin.settings.annotation_gutter_default_fold_state}
            onChange={() => {
                plugin.settings.annotation_gutter_default_fold_state =
                  !plugin.settings.annotation_gutter_default_fold_state;
                plugin.saveSettings();
          }}
        />
    {/snippet}
</SettingItem>

<SettingItem
        name="Show fold button"
        description="Display a button within the editor for (un)folding the gutter"
        type="toggle"
        depth={1}
>
    {#snippet control()}
        <Toggle
            value={plugin.settings.annotation_gutter_fold_button}
            onChange={() => {
                plugin.settings.annotation_gutter_fold_button =
                  !plugin.settings.annotation_gutter_fold_button;
                plugin.saveSettings();
            }}
        />
    {/snippet}
</SettingItem>

<SettingItem
        name="Hide when empty"
        description="When enabled, the gutter will not take up any space when there are no annotations in the current note"
        notices={[{ type: "info", text: "When enabled, switching between different notes may cause content to shift" }]}
        type="toggle"
        depth={1}
>
    {#snippet control()}
        <Toggle
            value={plugin.settings.annotation_gutter_hide_empty}
            onChange={() => {
                plugin.settings.annotation_gutter_hide_empty =
                  !plugin.settings.annotation_gutter_hide_empty;
                plugin.saveSettings();
            }}
        />
    {/snippet}
</SettingItem>
