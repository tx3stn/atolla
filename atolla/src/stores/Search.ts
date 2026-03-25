// @ts-nocheck

export interface RecentSearchPersistence {
	fetchString(key: string): Promise<string>;
	storeString(key: string, value: string): Promise<void>;
}

const RECENT_SEARCHES_KEY = 'recent_searches';
const RECENT_SEARCHES_LIMIT = 5;

class InMemoryRecentSearchPersistence implements RecentSearchPersistence {
	private values = new Map<string, string>();

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

export class SearchStore {
	constructor(private store: RecentSearchPersistence = new InMemoryRecentSearchPersistence()) {}

	async getRecentSearches(): Promise<Array<string>> {
		try {
			const stored = await this.store.fetchString(RECENT_SEARCHES_KEY);
			const parsed = JSON.parse(stored) as Array<string>;
			if (!Array.isArray(parsed)) {
				return [];
			}

			return parsed.filter((term) => typeof term === 'string').slice(0, RECENT_SEARCHES_LIMIT);
		} catch {
			return [];
		}
	}

	async addRecentSearch(term: string): Promise<Array<string>> {
		const trimmed = term.trim();
		if (!trimmed) {
			return this.getRecentSearches();
		}

		const recent = await this.getRecentSearches();
		const next = [
			trimmed,
			...recent.filter((existing) => existing.toLowerCase() !== trimmed.toLowerCase()),
		].slice(0, RECENT_SEARCHES_LIMIT);

		try {
			await this.store.storeString(RECENT_SEARCHES_KEY, JSON.stringify(next));
		} catch {
			// best effort persistence
		}

		return next;
	}
}
