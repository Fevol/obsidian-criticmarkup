<script lang='ts'>
	import { Button } from '../../../components';

	import { openGithubIssueLink } from '../../../../obsidian-util';
	import type CommentatorPlugin from '../../../../main';
	import SettingItem from '../../../components/obsidian/SettingItem.svelte';
	import Toggle from '../../../components/base/Toggle.svelte';

	export let plugin: CommentatorPlugin;
</script>

