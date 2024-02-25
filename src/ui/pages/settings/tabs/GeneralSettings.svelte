<script lang='ts'>
	import { SettingItem, Button, Dropdown, Slider, Toggle } from '../../../components';

	import { openGithubIssueLink } from '../../../../obsidian-util';
	import type CommentatorPlugin from '../../../../main';

	import { PreviewMode } from '../../../../types';

	export let plugin: CommentatorPlugin;

	let preview_mode = plugin.settings.preview_mode;
	const preview_mode_notices = {
		"0": "All suggestions will be visible",
		"1": "Preview document as if all suggestions were accepted",
		"2": "Preview document as if all suggestions were rejected",
	}
</script>



<SettingItem
	name='Enable Suggestion Mode'
	description='Toggle suggestion mode'
	type='toggle'
>
	<Toggle
		slot='control'
		value={ plugin.settings.suggest_mode }
		onChange={ (value) => {
			plugin.settings.suggest_mode = value
			plugin.saveSettings();
		}}
	/>
</SettingItem>



<SettingItem
	name='Toggle Preview Mode'
	type='dropdown'
	notices={[
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
		value={ plugin.settings.preview_mode.toString() }
		onChange={ (value) => {
			preview_mode = value;
			plugin.settings.preview_mode = value
			plugin.saveSettings();
		}}
	/>
</SettingItem>


<SettingItem
	name='Include Metadata Extension'
	type='dropdown'
	notices={[
		{ type: 'info', text: 'Allow inclusion of metadata for suggestions, such as authorship, time, etc.' },
		{ type: 'warning', text: 'Suggestion metadata is *not* part of the official CriticMarkup standard, and the metadata will not be processed/rendered correctly in other editors' },
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

