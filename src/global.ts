import type { App } from "obsidian";
import { type PluginSettings } from "./types";

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace COMMENTATOR_GLOBAL {
	/**
	 * @todo Figure out how to get plugin settings to all the required places
	 */
	export let PLUGIN_SETTINGS: PluginSettings;
}
