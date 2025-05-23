import type { App } from "obsidian";
import { type PluginSettings } from "./types";

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace COMMENTATOR_GLOBAL {
	/**
	 * Trading one global for an admittedly worse global
	 * Passing the App instance to CM plugins is just a major PitA
	 */
	export let app: App;
	export let PLUGIN_SETTINGS: PluginSettings;
}
