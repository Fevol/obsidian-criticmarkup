<script lang='ts'>
	import { SettingItem, Toggle } from '../../../components';

	import type CommentatorPlugin from '../../../../main';

	export let plugin: CommentatorPlugin;
</script>



<SettingItem
	name='Editor header'
	type='heading'
/>

<SettingItem
	name='Full button labels'
	description='Adds labels to the buttons in the editor header'
	type='toggle'
>
	<Toggle
		slot='control'
		value={plugin.settings.toolbar_show_buttons_labels}
		onChange={() => {
			plugin.settings.toolbar_show_buttons_labels = !plugin.settings.toolbar_show_buttons_labels;
			plugin.saveSettings();
		}}
	/>
</SettingItem>

<SettingItem
	name='Preview mode header button'
	description="Adds a button to the editor's header for quickly changing preview mode"
	type='toggle'
>
	<Toggle
		slot='control'
		value={plugin.settings.toolbar_preview_button}
		onChange={() => {
			plugin.settings.toolbar_preview_button = !plugin.settings.toolbar_preview_button;
			plugin.saveSettings();
		}}
	/>
</SettingItem>

<SettingItem
	name='Suggestion mode header button'
	description="Adds a button to the editor's header for quickly toggling suggestion mode"
	type='toggle'
>
	<Toggle
		slot='control'
		value={plugin.settings.toolbar_suggest_button}
		onChange={() => {
			plugin.settings.toolbar_suggest_button = !plugin.settings.toolbar_suggest_button;
			plugin.saveSettings();
		}}
	/>
</SettingItem>



<SettingItem
	name='Editor status bar'
	type='heading'
/>

<SettingItem
	name='Preview mode status bar toggle'
	description='Adds a status bar item for quickly selecting suggestion mode'
	type='toggle'
>
	<Toggle
		slot='control'
		value={plugin.settings.status_bar_preview_button}
		onChange={() => {
			plugin.settings.status_bar_preview_button = !plugin.settings.status_bar_preview_button;
			plugin.saveSettings();
		}}
	/>
</SettingItem>

<SettingItem
	name='Suggestion mode status bar toggle'
	description='Adds a status bar item for quickly selecting suggestion mode'
	type='toggle'
>
	<Toggle
		slot='control'
		value={plugin.settings.status_bar_suggest_button}
		onChange={() => {
			plugin.settings.status_bar_suggest_button = !plugin.settings.status_bar_suggest_button;
			plugin.saveSettings();
		}}
	/>
</SettingItem>

<SettingItem
	name='Metadata status bar toggle'
	description='Adds a status bar item for quickly toggling the inclusion of (particular) metadata'
	type='toggle'
>
	<Toggle
		slot='control'
		value={plugin.settings.status_bar_metadata_button}
		onChange={() => {
			plugin.settings.status_bar_metadata_button = !plugin.settings.status_bar_metadata_button;
			plugin.saveSettings();
		}}
	/>
</SettingItem>
