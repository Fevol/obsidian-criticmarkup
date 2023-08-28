import localforage from 'localforage';
import { type EventRef, Events, Notice, type Plugin, TFile } from 'obsidian';

type DatabaseItem<T> = {
    data: T,
    mtime: number
}


export class EventComponent extends Events {
    _events: (() => void)[] = [];

    onunload() {
    }

    unload() {
        while (this._events.length > 0) {
            this._events.pop()!();
        }
    }

    register(event_unload: () => void) {
        this._events.push(event_unload);
    }

    registerEvent(event: EventRef) {
        // @ts-ignore (Eventref contains reference to the Events object it was attached to)
        this.register(() => event.e.offref(event));
    }
}


/**
 * Generic database class for storing data in indexedDB, automatically updates on file changes
 */
export class Database<T> extends EventComponent {
    cache: typeof localforage;

    on(name: 'database-update' | 'database-create', callback: (entries: DatabaseItem<T>[]) => void, ctx?: any) {
        return super.on.call(this, name, callback, ctx);
    }

    /**
     * Constructor for the database
     * @param plugin The plugin that owns the database
     * @param name Name of the database within indexedDB
     * @param title Title of the database
     * @param version Version of the database
     * @param description Description of the database
     * @param defaultValue Constructor for the default value of the database
     * @param extractValue Provide new values for database on file modification
     */
    constructor(
        plugin: Plugin,
        name: string,
        title: string,
        version: number,
        description: string,
        defaultValue: () => T,
        extractValue: (file: TFile) => Promise<T>,
    ) {
        super();

        // localforage does not offer a method for accessing the database version, so we store it separately
        const oldVersion = parseFloat(plugin.app.loadLocalStorage(name + '-version')) || null;

        this.cache = localforage.createInstance({
            name: name + `/${plugin.app.appId}`,
            driver: localforage.INDEXEDDB,
            description,
            version,
        });

        plugin.app.workspace.onLayoutReady(async () => {
            const document_fragment = new DocumentFragment();
            const message = document_fragment.createEl('div');
            const center = document_fragment.createEl('div', { cls: 'commentator-progress-bar' });

            const markdownFiles = plugin.app.vault.getMarkdownFiles();

            const progress_bar = center.createEl('progress');
            progress_bar.setAttribute('max', markdownFiles.length.toString());
            progress_bar.setAttribute('value', '0');

            const notice = new Notice(document_fragment, 0);

            if (oldVersion !== null && oldVersion < version && !await this.isEmpty()) {
                message.textContent = `Migrating ${title} database...`;

                // Current setting: rebuild the entire database
                for (let i = 0; i < markdownFiles.length; i++) {
                    const file = markdownFiles[i];
                    await this.storeKey(file.path, await extractValue(file), file.stat.mtime);
                    progress_bar.setAttribute('value', (i + 1).toString());
                }
                notice.hide();

                setTimeout(async () => this.trigger('database-update', await this.allEntries()), 1000);
                // this.trigger('database-migrate');
                plugin.app.saveLocalStorage(name + '-version', version.toString());
            } else if (await this.isEmpty()) {
                message.textContent = `Initializing ${title} database...`;

                for (let i = 0; i < markdownFiles.length; i++) {
                    const file = markdownFiles[i];
                    await this.storeKey(file.path, await extractValue(file), file.stat.mtime);
                    progress_bar.setAttribute('value', (i + 1).toString());
                }
                notice.hide();

                setTimeout(async () => this.trigger('database-update', await this.allEntries()), 1000);
                this.trigger('database-create');
            } else {
                message.textContent = `Loading ${title} database...`;

                for (const key of await this.allKeys()) {
                    if (!markdownFiles.some(file => file.path === key))
                        await this.deleteKey(key);
                }

                for (let i = 0; i < markdownFiles.length; i++) {
                    const file = markdownFiles[i];
                    const value = await this.getItem(file.path);
                    if (value === null || value.mtime < file.stat.mtime)
                        await this.storeKey(file.path, await extractValue(file), file.stat.mtime);

                    progress_bar.setAttribute('value', (i + 1).toString());
                }

                notice.hide();
                setTimeout(async () => {
                    this.trigger('database-update', await this.allEntries());
                }, 1000);
                plugin.app.saveLocalStorage(name + '-version', version.toString());
            }

            // Alternatives: use 'this.editorExtensions.push(EditorView.updateListener.of(async (update) => {'
            // 	for instant View updates, but this requires the file to be read into the cache first
            this.registerEvent(plugin.app.vault.on('modify', async (file) => {
                if (file instanceof TFile) {
                    await this.storeKey(file.path, await extractValue(file), file.stat.mtime);
                    this.trigger('database-update', await this.allEntries());
                }
            }));

            this.registerEvent(plugin.app.vault.on('delete', async (file) => {
                if (file instanceof TFile) {
                    await this.deleteKey(file.path);
                    this.trigger('database-update', await this.allEntries());
                }
            }));

            this.registerEvent(plugin.app.vault.on('rename', async (file, oldPath) => {
                if (file instanceof TFile) {
                    await this.renameKey(oldPath, file.path, file.stat.mtime);
                    this.trigger('database-update', await this.allEntries());
                }
            }));

            this.registerEvent(plugin.app.vault.on('create', async (file) => {
                if (file instanceof TFile) {
                    await this.storeKey(file.path, defaultValue(), file.stat.mtime);
                    this.trigger('database-update', await this.allEntries());
                }
            }));
        });
    }

    async storeKey(key: string, value: T, mtime?: number) {
        await this.cache.setItem(key, {
            data: value,
            mtime: mtime ?? Date.now(),
        });
    }

    async deleteKey(key: string) {
        await this.cache.removeItem(key);
    }

    async renameKey(oldKey: string, newKey: string, mtime?: number) {
        const value = await this.getItem(oldKey);
        if (value == null) throw new Error('Key does not exist');

        await this.storeKey(newKey, value.data, mtime);
        await this.deleteKey(oldKey);
    }

    async allKeys(): Promise<string[]> {
        return await this.cache.keys();
    }

    async getValue(key: string): Promise<T | null> {
        return (await this.cache.getItem(key) as DatabaseItem<T> | null)?.data ?? null;
    }

    async allValues(): Promise<T[]> {
        const keys = await this.allKeys();
        return await Promise.all(keys.map(key => this.getValue(key) as Promise<T>));
    }

    async getItem(key: string): Promise<DatabaseItem<T> | null> {
        return await this.cache.getItem(key);
    }

    async allItems(): Promise<DatabaseItem<T>[]> {
        const keys = await this.allKeys();
        return await Promise.all(keys.map(key => this.cache.getItem(key) as Promise<DatabaseItem<T>>));
    }

    async allEntries(): Promise<[string, DatabaseItem<T>][] | null> {
        const keys = await this.allKeys();
        return await Promise.all(keys.map(key => this.cache.getItem(key).then(value => [key, value] as [string, DatabaseItem<T>])));
    }

    async dropDatabase() {
        await this.cache.dropInstance();
    }

    async clearDatabase() {
        await this.cache.clear();
    }

    async isEmpty(): Promise<boolean> {
        return (await this.cache.length()) == 0;
    }
}

