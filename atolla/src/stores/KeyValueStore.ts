// a minimal string key/value persistence backend. the Valdi PersistentStore satisfies this
// structurally, so stores accept this interface and the app injects a PersistentStore, while unit
// tests inject InMemoryKeyValueStore — keeping the store files free of the native persistence module.
export interface KeyValueStore {
	fetchString(key: string): Promise<string>;
	storeString(key: string, value: string): Promise<void>;
}

export class InMemoryKeyValueStore implements KeyValueStore {
	private values = new Map<string, string>();

	exists(key: string): Promise<boolean> {
		return Promise.resolve(this.values.has(key));
	}

	fetchString(key: string): Promise<string> {
		const value = this.values.get(key);
		if (value == null) {
			return Promise.reject(new Error('missing key'));
		}
		return Promise.resolve(value);
	}

	storeString(key: string, value: string): Promise<void> {
		this.values.set(key, value);
		return Promise.resolve();
	}
}
