<script lang='ts'>
	import { SettingItem, Toggle } from '../../../components';

	import type CommentatorPlugin from '../../../../main';

	export let plugin: CommentatorPlugin;
</script>

<SettingItem
	name='Functionality'
	type='heading'
/>

<SettingItem
	name='Alternative cursor movement'
	description='Enable corrected cursor movement through text in suggestion mode'
	notices={[
		{ type: 'info', text: 'If CriticMarkup syntax is encountered when moving through the document with keyboard controls, the cursor will skip through it as if it does not exist' }
	]}
	type='toggle'
>
	<Toggle
		slot='control'
		value={plugin.settings.alternative_cursor_movement}
		onChange={() => {
			plugin.settings.alternative_cursor_movement = !plugin.settings.alternative_cursor_movement;
			plugin.saveSettings();
		}}
	/>
</SettingItem>

<SettingItem
	name='Rendering'
	type='heading'
/>

<SettingItem
	name='Live Preview renderer'
	description='Enable custom rendering of CriticMarkup syntax in Live Preview'
	type='toggle'
>
	<Toggle
		slot='control'
		value={plugin.settings.live_preview}
		onChange={() => {
			plugin.settings.live_preview = !plugin.settings.live_preview;
			plugin.saveSettings();
		}}
	/>
</SettingItem>

<SettingItem
	name='Reading View renderer'
	description='Enable custom rendering of CriticMarkup syntax in Reading View'
	type='toggle'
>
	<Toggle
		slot='control'
		value={plugin.settings.post_processor}
		onChange={() => {
			plugin.settings.post_processor = !plugin.settings.post_processor;
			plugin.saveSettings();
		}}
	/>
</SettingItem>
