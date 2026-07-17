import { ViewCache, type ViewCacheDiskStore } from 'atolla/src/services/ViewCache';

class InMemoryDisk implements ViewCacheDiskStore {
	private readonly values = new Map<string, string>();

	fetchString(key: string): Promise<string> {
		const value = this.values.get(key);
		return value == null ? Promise.reject(new Error('missing key')) : Promise.resolve(value);
	}

	remove(key: string): Promise<void> {
		this.values.delete(key);
		return Promise.resolve();
	}

	storeString(key: string, value: string): Promise<void> {
		this.values.set(key, value);
		return Promise.resolve();
	}
}

// a real ViewCache backed by an in-memory disk, for specs that render cache-aware views
export function makeTestViewCache(): ViewCache {
	return new ViewCache({ disk: new InMemoryDisk(), maxEntries: 32 });
}
