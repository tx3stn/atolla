import { describe, expect, it } from 'bun:test';
import { createPagedGridController } from './Grid';

interface TestItem {
	id: string;
}

interface TestState {
	hasMore: boolean;
	isLoadingNextPage: boolean;
	items: Array<TestItem>;
	nextPageFailed: boolean;
	page: number;
}

describe('createPagedGridController', () => {
	it('loads first page and updates state', async () => {
		let state: TestState = {
			hasMore: true,
			isLoadingNextPage: false,
			items: [],
			nextPageFailed: false,
			page: 0,
		};

		const controller = createPagedGridController<TestItem>({
			fetchPage: async () => ({ hasMore: true, items: [{ id: 'one' }] }),
			isDestroyed: () => false,
			setState: (patch) => {
				state = { ...state, ...patch };
			},
		});

		await controller.loadNextPage();

		expect(state.items).toEqual([{ id: 'one' }]);
		expect(state.page).toBe(1);
		expect(state.hasMore).toBe(true);
		expect(state.nextPageFailed).toBe(false);
	});

	it('appends subsequent pages and toggles loading state for non-first page', async () => {
		let state: TestState = {
			hasMore: true,
			isLoadingNextPage: false,
			items: [],
			nextPageFailed: false,
			page: 0,
		};
		const loadingFlags: Array<boolean> = [];
		let request = 0;

		const controller = createPagedGridController<TestItem>({
			fetchPage: () => {
				request += 1;
				if (request === 1) {
					return Promise.resolve({ hasMore: true, items: [{ id: 'one' }] });
				}
				return Promise.resolve({ hasMore: false, items: [{ id: 'two' }] });
			},
			isDestroyed: () => false,
			setState: (patch) => {
				state = { ...state, ...patch };
				if (typeof patch.isLoadingNextPage === 'boolean') {
					loadingFlags.push(patch.isLoadingNextPage);
				}
			},
		});

		await controller.loadNextPage();
		await controller.loadNextPage();

		expect(state.items).toEqual([{ id: 'one' }, { id: 'two' }]);
		expect(state.page).toBe(2);
		expect(state.hasMore).toBe(false);
		expect(loadingFlags).toContain(true);
		expect(loadingFlags[loadingFlags.length - 1]).toBe(false);
	});

	it('marks next page failed when fetch rejects', async () => {
		let state: TestState = {
			hasMore: true,
			isLoadingNextPage: false,
			items: [{ id: 'existing' }],
			nextPageFailed: false,
			page: 1,
		};

		const controller = createPagedGridController<TestItem>({
			fetchPage: () => Promise.reject(new Error('failure')),
			isDestroyed: () => false,
			setState: (patch) => {
				state = { ...state, ...patch };
			},
		});

		await controller.loadNextPage();

		expect(state.nextPageFailed).toBe(true);
		expect(state.isLoadingNextPage).toBe(false);
		expect(state.items).toEqual([{ id: 'existing' }]);
	});

	it('does not load when already loading', async () => {
		let state: TestState = {
			hasMore: true,
			isLoadingNextPage: false,
			items: [],
			nextPageFailed: false,
			page: 0,
		};
		let calls = 0;

		const controller = createPagedGridController<TestItem>({
			fetchPage: async () => {
				calls += 1;
				await Promise.resolve();
				return { hasMore: false, items: [{ id: 'one' }] };
			},
			isDestroyed: () => false,
			setState: (patch) => {
				state = { ...state, ...patch };
			},
		});

		await Promise.all([controller.loadNextPage(), controller.loadNextPage()]);

		expect(calls).toBe(1);
	});

	it('resets internal paging counters', async () => {
		let state: TestState = {
			hasMore: true,
			isLoadingNextPage: false,
			items: [],
			nextPageFailed: false,
			page: 0,
		};
		let request = 0;

		const controller = createPagedGridController<TestItem>({
			fetchPage: (page) => {
				request += 1;
				return Promise.resolve({ hasMore: request < 2, items: [{ id: `${page}` }] });
			},
			isDestroyed: () => false,
			setState: (patch) => {
				state = { ...state, ...patch };
			},
		});

		await controller.loadNextPage();
		controller.reset();
		state = { ...state, hasMore: true, items: [], page: 0 };
		await controller.loadNextPage();

		expect(state.page).toBe(1);
		expect(state.items).toEqual([{ id: '1' }]);
	});
});
