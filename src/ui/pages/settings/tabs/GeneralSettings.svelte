<script lang='ts'>
	import { SettingItem, Button, Dropdown, Slider, Toggle } from '../../../components';

	import { openGithubIssueLink } from '../../../../obsidian-util';
	import type CommentatorPlugin from '../../../../main';

	import {EditMode, PreviewMode} from '../../../../types';

	export let plugin: CommentatorPlugin;

	let preview_mode = plugin.settings.default_preview_mode;
	const preview_mode_notices = {
		[PreviewMode.ALL]: "All suggestions will be visible",
		[PreviewMode.ACCEPT]: "Preview document as if all suggestions were accepted",
		[PreviewMode.REJECT]: "Preview document as if all suggestions were rejected",
	}
</script>



<SettingItem
		name="Default <i>Edit</i> Mode"
		type='dropdown'
		notices={[
			{ type: 'info', text: 'When opening a new note, this will be the default editing mode' },
		]}
>
	<Dropdown
			slot='control'
			options={[
			{ value: EditMode.OFF.toString(), text: 'Regular Edit Mode' },
			{ value: EditMode.CORRECTED.toString(), text: 'Corrected Edit Mode' },
			{ value: EditMode.SUGGEST.toString(), text: 'Suggestion Mode' },
		]}
			value={ plugin.settings.default_edit_mode.toString() }
			onChange={ (value) => {
				let edit_mode = parseInt(value);
				plugin.settings.default_edit_mode = edit_mode;
				plugin.saveSettings();
			}}
	/>
</SettingItem>

<SettingItem
	name="Default <i>Preview</i> Mode"
	type='dropdown'
	notices={[
		{ type: 'info', text: 'When opening a new note, this will be the default editing mode' },
		{ type: 'info', text: preview_mode_notices[preview_mode] },
	]}
>
	<Dropdown
		slot='control'
		options={[
			{ value: PreviewMode.ALL.toString(), text: 'View all suggestions' },
			{ value: PreviewMode.ACCEPT.toString(), text: "Preview 'accept all'" },
			{ value: PreviewMode.REJECT.toString(), text: "Preview 'reject all'" },
		]}
		value={ plugin.settings.default_preview_mode.toString() }
		onChange={ (value) => {
			preview_mode = parseInt(value);
			plugin.settings.default_preview_mode = preview_mode;
			plugin.saveSettings();
		}}
	/>
</SettingItem>


<SettingItem
	name='Include Metadata Extension'
	type='dropdown'
	notices={[
		{ type: 'info', text: 'Allow inclusion of metadata for suggestions, such as authorship, time, etc.' },
		{ type: 'warning', text: 'Suggestion metadata is <b>not</b> part of the official CriticMarkup standard, this metadata will not get processed/rendered correctly in other editors' },
	]}
>
	<Toggle
		slot='control'
		value={ plugin.settings.enable_metadata }
		onChange={ (value) => {
			plugin.settings.enable_metadata = value
			plugin.saveSettings();
		}}
	/>
</SettingItem>




<SettingItem
	name="Database Settings"
	type="heading"
/>

<SettingItem
	name='Database Workers'
	description='Number of workers to use for database indexing'
	notices={[
		{ type: 'info', text: 'A higher amount of workers will increase indexing speed' },
	]}
	type='slider'
>
	<Slider
		slot='control'
		min={ 1 }
		max={ navigator.hardwareConcurrency / 2 }
		step={ 1 }
		value={ plugin.settings.database_workers }
		onChange={ (value) => {
			plugin.settings.database_workers = value;
			plugin.saveSettings();
		}}
	/>
</SettingItem>

<SettingItem
	name='Rebuild Database'
	notices={[
		{ type: 'info', text: "Recommended action to try if you're encountering issues with the view after updating" },
		{ type: 'warning', text: 'In large vaults, reindexing the database may take while' }
	]}
>
	<Button
		slot='control'
		text='Rebuild'
		onClick={ async () => {
			await plugin.database.reinitializeDatabase();
			console.log("Database rebuilt");
		}}
	/>
</SettingItem>





<div class='criticmarkup-important-buttons criticmarkup-fail'>
	<Button
		class='translator-fail'
		text='REPORT BUG'
		icon='bug'
		onClick={ () => openGithubIssueLink(
			undefined,
			{
				/* Additional data that will be added to the debugger information */
			}
		) }
	/>
</div>

