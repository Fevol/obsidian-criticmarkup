import { apiVersion, App, Platform } from "obsidian";

/**
 * Helper function for opening the settings tab of the plugin
 *
 * @param app - Obsidian app instance
 * @param plugin_id - ID of the tab to open
 * @remark prevents the plugin tab to be opened again, despite already being open (otherwise, some nasty bugs can occur due to settings mount logic of settings page unnecessarily being executed twice)
 */
export function openSettingTab(app: App, plugin_id: string = "commentator") {
	app.setting.open();
	if (app.setting.lastTabId !== plugin_id)
		app.setting.openTabById(plugin_id);
}

/**
 * Helper function for getting debug information
 * @param app - Obsidian app instance
 * @async
 * @returns \{platform: string, plugin_version: string, obsidian_version: string, framework_version: string}
 */
export async function getObsidianData(app: App) {
	let framework_version;
	if (Platform.isMobileApp) {
		// @ts-ignore (Capacitor exists)
		const capacitor_info = await Capacitor.nativePromise("App", "getInfo");
		if (capacitor_info)
			framework_version = capacitor_info.version + " (" + capacitor_info.build + ")";
	} else {
		framework_version = navigator.userAgent.match(/obsidian\/([\d.]+\d+)/)?.[1] || "unknown";
	}

	return {
		plugin_version: app.plugins.plugins["commentator"].manifest.version,
		platform: Platform.isMobileApp ?
			(Platform.isAndroidApp ? "Android" : Platform.isIosApp ? "iOS" : "mobile") :
			(Platform.isMacOS ? "macOS" : "Desktop"),
		framework_version,
		obsidian_version: apiVersion,
	};
}

/**
 * Helper function for generating a pre-filled bug report for GitHub
 * @async
 * @param app - Obsidian app instance
 * @param title - Title of the bug report
 * @param data - Debug information
 * @returns {string} - URL to create a new issue on GitHub
 */
export async function generateGithubIssueLink(app: App, title: string, data: Record<string, string> = {}) {
	const title_string = title ? `[BUG] ${title} – ADD A TITLE HERE` : "[BUG] ADD A TITLE HERE";
	try {
		const base_data = await getObsidianData(app);
		const issue_data = { ...base_data, ...data };
		const data_string = Object.entries(issue_data).map(([key, value]) => `**${key}**: ${JSON.stringify(value)}`)
			.join("\n");

		return `https://github.com/Fevol/obsidian-criticmarkup/issues/new?` +
			new URLSearchParams({
				title: title_string,
				body:
					`# User report\n**Description:** ADD A SHORT DESCRIPTION HERE \n\n\n\n---\n# Debugger data (do not alter)\n${data_string}`,
				labels: `bug`,
			});
	} catch (e) {
		return "https://github.com/Fevol/obsidian-criticmarkup/issues/new?" +
			new URLSearchParams({
				title: title_string,
				body:
					`# User report\n**Description:** ADD A SHORT DESCRIPTION HERE \n\n\n\n---\n# Debugger data (do not alter)\n**Error while generating debugger data:** ${e}`,
				labels: `bug`,
			});
	}
}

/**
 * Helper function to open GitHub issue link for user
 * @async
 * @param app - Obsidian app instance
 * @param title - Title of the bug report
 * @param data - Debug information
 * @returns {Promise<void>}
 */
export async function openGithubIssueLink(app: App, title: string = "", data: Record<string, string> = {}) {
	window.open(await generateGithubIssueLink(app, title, data), "_blank");
}

/**
 * Helper function to overwrite a method of a view whose prototype is not directly accessible
 * @param app - Obsidian app instance
 * @param viewType - Type of the view (should exist in app.viewRegistry.viewByType)
 * @param getChildPrototype - Function to get the prototype of the child view (if the view is a composite view)
 * @tutorial
 * ```ts
 * this.app.workspace.onLayoutReady(async () => {
 *    const uninstall = around(getPrototype('outline'), {
 *    createItemDom: (oldMethod, view) => {
 *        return (call_args: any[]) => {
 *            const output = oldMethod(call_args);
 *            return output;
 *        }
 *    }
 * });
 * ```
 */
export function getViewPrototype<T>(
	app: App,
	viewType: string,
	getChildPrototype: (view: unknown) => unknown = (view) => view,
): T {
	const leafOfType = app.workspace.getLeavesOfType(viewType)[0];
	let prototype: T;
	if (leafOfType)
		prototype = Object.getPrototypeOf(getChildPrototype(leafOfType.view)) as T;
	else {
		const leaf = app.workspace.getLeaf("split");
		const constructed_leaf = app.viewRegistry.getViewCreatorByType(viewType)?.(leaf);
		prototype = Object.getPrototypeOf(getChildPrototype(constructed_leaf)) as T;
		leaf.detach();
	}
	return prototype;
}
