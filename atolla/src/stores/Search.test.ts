import { describe, expect, it } from 'bun:test';
import { type RecentSearchPersistence, SearchStore } from './Search';

class MockRecentSearchPersistence implements RecentSearchPersistence {
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

	seed(key: string, value: string): void {
		this.values.set(key, value);
	}
}

describe('SearchStore', () => {
	it('returns empty recent searches when persistence has no value', async () => {
		const store = new SearchStore(new MockRecentSearchPersistence());
		expect(await store.getRecentSearches()).toEqual([]);
	});

	it('adds a term to the top of history', async () => {
		const persistence = new MockRecentSearchPersistence();
		const store = new SearchStore(persistence);

		expect(await store.addRecentSearch('Converge')).toEqual(['Converge']);
		expect(await store.getRecentSearches()).toEqual(['Converge']);
	});

	it('keeps terms unique and moves repeated term to the top', async () => {
		const persistence = new MockRecentSearchPersistence();
		const store = new SearchStore(persistence);

		await store.addRecentSearch('Converge');
		await store.addRecentSearch('Jane Doe');
		await store.addRecentSearch('converge');

		expect(await store.getRecentSearches()).toEqual(['converge', 'Jane Doe']);
	});

	it('stores at most five recent terms in recency order', async () => {
		const persistence = new MockRecentSearchPersistence();
		const store = new SearchStore(persistence);

		await store.addRecentSearch('One');
		await store.addRecentSearch('Two');
		await store.addRecentSearch('Three');
		await store.addRecentSearch('Four');
		await store.addRecentSearch('Five');
		await store.addRecentSearch('Six');

		expect(await store.getRecentSearches()).toEqual(['Six', 'Five', 'Four', 'Three', 'Two']);
	});

	it('ignores empty terms when adding to history', async () => {
		const persistence = new MockRecentSearchPersistence();
		const store = new SearchStore(persistence);

		await store.addRecentSearch('Converge');
		await store.addRecentSearch('   ');

		expect(await store.getRecentSearches()).toEqual(['Converge']);
	});

	it('returns empty list for invalid persisted JSON shape', async () => {
		const persistence = new MockRecentSearchPersistence();
		persistence.seed('recent_searches', JSON.stringify({ invalid: true }));
		const store = new SearchStore(persistence);

		expect(await store.getRecentSearches()).toEqual([]);
	});
});
