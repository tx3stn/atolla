import type { CancelablePromise } from 'valdi_core/src/CancelablePromise';

export const TRACK_PAGE_SIZE = 50;

export interface GridPaginationConfig {
	initialBackgroundPages: number;
	nextPageTriggerRatio: number;
	pageSize: number;
}

export const gridPaginationConfig: GridPaginationConfig = {
	initialBackgroundPages: 1,
	nextPageTriggerRatio: 0.7,
	pageSize: 24,
};

export interface PagedResult<TItem> {
	hasMore: boolean;
	items: Array<TItem>;
}

interface PagedGridState<TItem> {
	hasMore: boolean;
	isLoadingNextPage: boolean;
	items: Array<TItem>;
	nextPageFailed: boolean;
	page: number;
}

type PagedGridPatch<TItem> = Partial<PagedGridState<TItem>>;

interface CreatePagedGridControllerArgs<TItem> {
	fetchPage: (page: number) => CancelablePromise<PagedResult<TItem>>;
	isDestroyed: () => boolean;
	onPageLoaded?: (items: Array<TItem>) => void;
	setState: (patch: PagedGridPatch<TItem>) => void;
}

export interface PagedGridController {
	dispose: () => void;
	loadNextPage: () => Promise<void>;
	reset: () => void;
}

export function createPagedGridController<TItem>(
	args: CreatePagedGridControllerArgs<TItem>,
): PagedGridController {
	let currentPage = 0;
	let isLoadingPage = false;
	let hasMore = true;
	let currentItems: Array<TItem> = [];
	// bumped whenever the paging session is invalidated (reset/dispose); a page that
	// resolves against a stale generation is dropped instead of landing in state.
	let generation = 0;
	let inFlight: CancelablePromise<PagedResult<TItem>> | undefined;

	const cancelInFlight = (): void => {
		inFlight?.cancel?.();
		inFlight = undefined;
	};

	const dispose = (): void => {
		generation += 1;
		cancelInFlight();
	};

	const reset = (): void => {
		generation += 1;
		cancelInFlight();
		currentPage = 0;
		isLoadingPage = false;
		hasMore = true;
		currentItems = [];
	};

	const loadNextPage = async (): Promise<void> => {
		if (args.isDestroyed() || isLoadingPage || !hasMore) {
			return;
		}

		const nextPage = currentPage + 1;
		const isFirstPage = nextPage === 1;
		const requestGeneration = generation;
		isLoadingPage = true;

		if (!isFirstPage) {
			args.setState({ isLoadingNextPage: true, nextPageFailed: false });
		}

		const request = args.fetchPage(nextPage);
		inFlight = request;

		try {
			const page = await request;
			if (args.isDestroyed() || requestGeneration !== generation) {
				return;
			}
			inFlight = undefined;

			currentPage = nextPage;
			isLoadingPage = false;
			hasMore = page.hasMore;
			currentItems = isFirstPage ? page.items : [...currentItems, ...page.items];
			args.onPageLoaded?.(page.items);

			args.setState({
				hasMore: page.hasMore,
				isLoadingNextPage: false,
				items: currentItems,
				nextPageFailed: false,
				page: nextPage,
			});
		} catch {
			if (args.isDestroyed() || requestGeneration !== generation) {
				return;
			}
			inFlight = undefined;

			isLoadingPage = false;
			args.setState({ isLoadingNextPage: false, nextPageFailed: true });
		}
	};

	return {
		dispose,
		loadNextPage,
		reset,
	};
}
