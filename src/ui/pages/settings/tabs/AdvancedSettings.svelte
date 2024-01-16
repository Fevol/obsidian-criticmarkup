<script lang='ts'>
	import {SettingItem, Dropdown, Toggle} from '../../../components';

	import type CommentatorPlugin from '../../../../main';

	export let plugin: CommentatorPlugin;

	const suggestion_ranges = {
		"addition": {icon: 'plus-circle', tooltip: 'Additions'},
		"deletion": {icon: 'minus-square', tooltip: 'Deletions'},
		"substitution": {icon: 'replace', tooltip: 'Substitutions'},
		"highlight": {icon: 'highlighter', tooltip: 'Highlights'},
		"comment": {icon: 'message-square', tooltip: 'Comments'},
	};

	const cursor_movement_options = [
		{ value: "unchanged", text: 'Unchanged' },
		{ value: "ignore_bracket", text: 'Skip syntax brackets' },
		{ value: "ignore_metadata", text: 'Skip syntax brackets and metadata' },
		{ value: "ignore_completely", text: 'Skip entire suggestion' },
	];

	const bracket_movement_options = [
		{ value: "unchanged", text: 'Unchanged' },
		{ value: "stay_inside", text: 'Keep cursor within range' },
		{ value: "stay_outside", text: 'Treat range as word group' },
	];

</script>

<SettingItem
	name='Functionality'
	type='heading'
/>

	<SettingItem
			name='Suggestion mode'
			type='heading'
			depth={1}
	/>

		<SettingItem
				name='Cursor movement'
				type='heading'
				depth={2}
		/>
<!--		SuggestionType enum -->
		{#each Object.keys(suggestion_ranges) as type}
			<SettingItem
					name={suggestion_ranges[type].tooltip}
					type='dropdown'
					depth={2}
			>
				<Dropdown
						slot='control'
						value={plugin.settings.suggestion_mode_cursor_movement.cursor_movement[type]}
						options={cursor_movement_options}
						onChange={(value) => {
							plugin.settings.suggestion_mode_cursor_movement.cursor_movement[type] = value;
							plugin.saveSettings();
						}}
				/>
			</SettingItem>
		{/each}


<SettingItem
	name='Suggestion mode cursor movement'
	description='Determine how the cursor should move through suggestions in suggestion mode'
	type='dropdown'
>

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
