import localforage from 'localforage';
import { Component, Notice, type Plugin, TFile } from 'obsidian';

type DatabaseEntry<T> = {
	data: T,
	time: number
}

/**
 * Generic database class for storing data in indexedDB, automatically updates on file changes
 */
export class Database<T> extends Component {
	cache: typeof localforage;

	async isEmpty(): Promise<boolean> {
		return (await this.cache.length()) == 0;
	}

	/**
	 * Constructor for the database
	 * @param plugin The plugin that owns the database
	 * @param name Name of the database within indexedDB
	 * @param title
	 * @param description Description of the database
	 * @param defaultValue Constructor for the default value of the database
	 * @param onModify Provide new values for database on file modification
	 * @param [onUpdate=] Function to run when the database is updated
	 * @param [onCreate=] Function to run when the database is created
	 */
	constructor(
		plugin: Plugin,
		name: string,
		title: string,
		description: string,
		defaultValue: () => T,
		onModify: (file: TFile) => Promise<T>,
		onUpdate: () => Promise<void> = async () => { },
		onCreate: () => Promise<void> = async () => { }
	) {
		super();

		this.cache = localforage.createInstance({ name, driver: localforage.INDEXEDDB, description });

		plugin.app.workspace.onLayoutReady(async () => {
			const document_fragment = new DocumentFragment();
			const message = document_fragment.createEl('div');
			const center = document_fragment.createEl('div', { cls: 'commentator-progress-bar' });

			const markdownFiles = plugin.app.vault.getMarkdownFiles();

			const progress_bar = center.createEl('progress');
			progress_bar.setAttribute('max', markdownFiles.length.toString());
			progress_bar.setAttribute('value', '0');

			const notice = new Notice(document_fragment, 0);

			if (await this.isEmpty()) {
				message.textContent = `Initializing ${title} database...`;

				for (let i = 0; i < markdownFiles.length; i++) {
					const file = markdownFiles[i];
					await this.storeKey(file.path, await onModify(file), file.stat.mtime);
					progress_bar.setAttribute('value', (i + 1).toString());
				}
				notice.hide();

				setTimeout(onUpdate, 1000);
				await onCreate();
			} else {
				message.textContent = `Loading ${title} database...`;

				for (const key of await this.allKeys()) {
					if (!markdownFiles.some(file => file.path === key))
						await this.deleteKey(key);
				}

				for (let i = 0; i < markdownFiles.length; i++) {
					const file = markdownFiles[i];
					const value = await this.getValue(file.path);
					if (value === null || value.time < file.stat.mtime)
						await this.storeKey(file.path, await onModify(file), file.stat.mtime);

					progress_bar.setAttribute('value', (i + 1).toString());
				}

				notice.hide();
				setTimeout(onUpdate, 1000);
			}

			// Alternatives: use 'this.editorExtensions.push(EditorView.updateListener.of(async (update) => {'
			// 	for instant View updates, but this requires the file to be read into the cache first
			this.registerEvent(plugin.app.vault.on('modify', async (file) => {
				if (file instanceof TFile) {
					await this.storeKey(file.path, await onModify(file), file.stat.mtime);
					await onUpdate();
				}
			}));

			this.registerEvent(plugin.app.vault.on('delete', async (file) => {
				if (file instanceof TFile) {
					await this.deleteKey(file.path);
					await onUpdate();
				}
			}));

			this.registerEvent(plugin.app.vault.on('rename', async (file, oldPath) => {
				if (file instanceof TFile) {
					await this.renameKey(oldPath, file.path, file.stat.mtime);
					await onUpdate();
				}
			}));

			this.registerEvent(plugin.app.vault.on('create', async (file) => {
				if (file instanceof TFile) {
					await this.storeKey(file.path, defaultValue(), file.stat.mtime);
					await onUpdate();
				}
			}));
		});
	}

	async storeKey(key: string, value: T, time?: number) {
		await this.cache.setItem(key, {
			data: value,
			time: time ?? Date.now()
		});
	}

	async deleteKey(key: string) {
		await this.cache.removeItem(key);
	}

	async renameKey(oldKey: string, newKey: string, time?: number) {
		const value = await this.getValue(oldKey);
		if (value == null) throw new Error("Key does not exist");

		await this.storeKey(newKey, value.data, time);
		await this.deleteKey(oldKey);
	}

	async allKeys(): Promise<string[]> {
		return await this.cache.keys();
	}

	async allValues(): Promise<DatabaseEntry<T>[]> {
		const keys = await this.allKeys();
		return await Promise.all(keys.map(key => this.cache.getItem(key) as Promise<DatabaseEntry<T>>));
	}

	async getValue(key: string): Promise<DatabaseEntry<T> | null> {
		return (await this.cache.getItem(key));
	}

	async allEntries(): Promise<[string, DatabaseEntry<T>][] | null> {
		const keys = await this.allKeys();
		return await Promise.all(keys.map(key => this.cache.getItem(key).then(value => [key, value] as [string, DatabaseEntry<T>])));
	}
}

