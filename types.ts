/**
 * Generic template for an Obsidian command
 */
export interface CommandI {
	/**
	 * Unique ID of the command
	 */
	id: string,

	/**
	 * Display name of the command
	 */
	name: string,

	/**
	 * Icon to be displayed next to the command (only used for mobile toolbar)
	 */
	icon: string,

	/**
	 * Whether the command requires editor context (active note)
	 */
	editor_context?: boolean

	/**
	 * Whether the command changes plugin data
	 */
	plugin_context?: boolean

	/**
	 * Callback function for the command
	 * @param args - Set of arguments passed to the command
	 */
	callback?: (...args: any[]) => any;

	editorCallback?: (...args: any[]) => any;
}
