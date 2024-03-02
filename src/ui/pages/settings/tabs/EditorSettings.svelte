<script lang='ts'>
	import { SettingItem, Dropdown, Slider, Toggle } from '../../../components';

	import type CommentatorPlugin from '../../../../main';

	export let plugin: CommentatorPlugin;


	let comment_rendering_mode = plugin.settings.comment_style;
	let comment_rendering_mode_notices = {
		"inline": "Comments receive a background color and are fully visible (similar to suggestions)",
		"icon": "Comments are displayed as icons and can be hovered over to reveal the comment",
		"block": "Comments are displayed in the right-margin of the editor",
	}
</script>

<SettingItem
	name='Editing features'
	type='heading'
/>

<SettingItem
	name='Automatic tag completion'
	notices={[
		{ type: 'info', text: "When typing <code>{++</code>, the tag automatically gets completed with <code>++}</code>" },
	]}
	type='toggle'
>
	<Toggle
		slot='control'
		value={plugin.settings.tag_completion}
		onChange={() => {
			plugin.settings.tag_completion = !plugin.settings.tag_completion;
			plugin.saveSettings();
		}}
	/>
</SettingItem>


<SettingItem
	name='Remove syntax on copy'
	description='When copying in the editor to the clipboard, any CriticMarkup syntax is removed'
	notices={[
		{ type: 'info', text: "Copying <code>my {++text++}</code> will result in <code>my text</code>" },
	]}
	type='toggle'
>
	<Toggle
		slot='control'
		value={plugin.settings.clipboard_remove_syntax}
		onChange={() => {
			plugin.settings.clipboard_remove_syntax = !plugin.settings.clipboard_remove_syntax;
			plugin.saveSettings();
		}}
	/>
</SettingItem>

<SettingItem
	name='Automatic tag correction'
	description='Dangling tags and redundant whitespaces automatically get removed to prevent invalid CriticMarkup syntax'
	type='toggle'
>
	<Toggle
		slot='control'
		value={plugin.settings.tag_correcter}
		onChange={() => {
			plugin.settings.tag_correcter = !plugin.settings.tag_correcter;
			plugin.saveSettings();
		}}
	/>
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
	name='Suggestion Rendering'
	type='heading'
/>

<SettingItem
	name='Suggestion gutter'
	description='Display presence of suggestions in the left margin of the editor'
	notices={[
		{ type: 'info', text: "Clicking on the gutter reveals a menu for accepting/rejecting all changes within the block" },
	]}
	type='toggle'
>
	<Toggle
		slot='control'
		value={plugin.settings.editor_gutter}
		onChange={() => {
			plugin.settings.editor_gutter = !plugin.settings.editor_gutter;
			plugin.saveSettings();
		}}
	/>
</SettingItem>

<SettingItem
	name='Hide suggestion gutter when empty'
	description='Gutter will not take up any space when there are no suggestions in the current note'
	type='toggle'
>
	<Toggle
		slot='control'
		value={plugin.settings.hide_empty_suggestion_gutter}
		onChange={() => {
			// TODO: Split up into two settings
			plugin.settings.hide_empty_suggestion_gutter = !plugin.settings.hide_empty_suggestion_gutter;
			plugin.saveSettings();
		}}
	/>
</SettingItem>

<SettingItem
	name='Show style while editing'
	description='Keep the style of suggestions visible while editing'
	type='toggle'
>
	<Toggle
		slot='control'
		value={plugin.settings.editor_styling}
		onChange={() => {
			plugin.settings.editor_styling = !plugin.settings.editor_styling;
			plugin.saveSettings();
		}}
	/>
</SettingItem>


<SettingItem
	name='Comments Rendering'
	type='heading'
/>

<SettingItem
	name='Comment rendering mode'
	description='Determine how comments are rendered in Live Preview'
	notices={[ { type: "info", text: comment_rendering_mode_notices[comment_rendering_mode] }]}
	type='dropdown'
>
	<Dropdown
		slot='control'
		options={[
			{ value: 'inline', text: 'Inline' },
			{ value: 'icon', text: 'Icon' },
			{ value: 'block', text: 'Block' },
		]}
		value={comment_rendering_mode}
		onChange={(value) => {
			plugin.settings.comment_style = value;
			comment_rendering_mode = value;
			plugin.saveSettings();
		}}
	/>
</SettingItem>


<SettingItem
	name='Comment gutter width'
	description='The width of the gutter in which comments are displayed'
	type='slider'
>
	<Slider
		slot='control'
		min={100}
		max={500}
		step={50}
		value={plugin.settings.comment_gutter_width}
		onChange={(value) => {
			plugin.settings.comment_gutter_width = value;
			plugin.saveSettings();
		}}
	/>
</SettingItem>

<SettingItem
	name='Fold comment gutter away by default'
	description='The comment gutter is folded away by default and can be revealed by clicking on the gutter'
	notices={[
		{ type: 'info', text: "Setting only applies after reload" },
	]}
	type='toggle'
>
	<Toggle
		slot='control'
		value={plugin.settings.default_folded_comment_gutter}
		onChange={() => {
			plugin.settings.default_folded_comment_gutter = !plugin.settings.default_folded_comment_gutter;
			plugin.saveSettings();
		}}
	/>
</SettingItem>

<SettingItem
	name="Comment gutter fold button"
	description="Display a button in the gutter to fold/unfold the comments"
	type='toggle'
>
	<Toggle
		slot='control'
		value={plugin.settings.comment_gutter_fold_button}
		onChange={() => {
			plugin.settings.comment_gutter_fold_button = !plugin.settings.comment_gutter_fold_button;
			plugin.saveSettings();
		}}
	/>
</SettingItem>

<SettingItem
	name='Hide comment gutter when empty'
	description='Gutter will not take up any space when there are no comments in the current note'
	type='toggle'
>
	<Toggle
		slot='control'
		value={plugin.settings.hide_empty_comment_gutter}
		onChange={() => {
			// TODO: Split up into two settings
			plugin.settings.hide_empty_comment_gutter = !plugin.settings.hide_empty_comment_gutter;
			plugin.saveSettings();
		}}
	/>
</SettingItem>

