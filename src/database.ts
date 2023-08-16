import localforage from 'localforage';


export class Database {
	cache: typeof localforage;

	constructor() {
		this.cache = localforage.createInstance({
			name: "commentator/cache/" + app.appId,
			driver: localforage.INDEXEDDB,
			description: "Vault-wide cache for Commentator plugin"
		});
	}

	async isEmpty(): Promise<boolean> {
		return (await this.cache.length()) == 0;
	}

	async storeKey(key: string, value: any) {
		await this.cache.setItem(key, {
			data: value,
			time: Date.now()
		});
	}

	async allKeys(): Promise<string[]> {
		return await this.cache.keys();
	}

	async allValues(): Promise<any[]> {
		const keys = await this.allKeys();
		return await Promise.all(keys.map(key => this.cache.getItem(key)));
	}

	async getValue(key: string): Promise<any> {
		return (await this.cache.getItem(key));
	}

	async allEntries(): Promise<any[]> {
		const keys = await this.allKeys();
		return await Promise.all(keys.map(key => this.cache.getItem(key).then(value => [key, value])));
	}
}

