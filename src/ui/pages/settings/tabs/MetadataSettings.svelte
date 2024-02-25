<script lang='ts'>
    import {SettingItem, Dropdown, Slider, Toggle, Input} from '../../../components';

    import type CommentatorPlugin from '../../../../main';

    export let plugin: CommentatorPlugin;

</script>

<SettingItem
        name='Added metadata'
        type='heading'
/>

<SettingItem
        name='Add Authorship Information'
        notices={[
		{ type: 'info', text: "Always add authorship information to suggestions and comments" },
	]}
        type='toggle'
>
    <Toggle
        slot='control'
        value={plugin.settings.enable_author}
        onChange={(value) => {
            plugin.settings.enable_author = value;
            plugin.saveSettings();
        }}
    />
</SettingItem>

{#if plugin.settings.enable_author}
    <SettingItem
        name='Name'
        depth={1}
    >
        <Input
            slot='control'
            type='text'
            bind:value={plugin.settings.author}
            onChange={(value) => {
                plugin.settings.author = value;
                plugin.saveSettings();
            }}
        />
    </SettingItem>
{/if}

<SettingItem
        name='Add Time Information'
        notices={[
            { type: 'info', text: "Appends timestamp information to new suggestions" },
        ]}
        type='toggle'
>
    <Toggle
        slot='control'
        value={plugin.settings.enable_timestamp}
        onChange={(value) => {
            plugin.settings.enable_timestamp = value;
            plugin.saveSettings();
        }}
    />
</SettingItem>
