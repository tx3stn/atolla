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
	fetchPage: (page: number) => PromiseLike<PagedResult<TItem>>;
	isDestroyed: () => boolean;
	onPageLoaded?: (items: Array<TItem>) => void;
	setState: (patch: PagedGridPatch<TItem>) => void;
}

export interface PagedGridController {
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

	const reset = (): void => {
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
		isLoadingPage = true;

		if (!isFirstPage) {
			args.setState({ isLoadingNextPage: true, nextPageFailed: false });
		}

		try {
			const page = await args.fetchPage(nextPage);
			if (args.isDestroyed()) {
				return;
			}

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
			if (args.isDestroyed()) {
				return;
			}

			isLoadingPage = false;
			args.setState({ isLoadingNextPage: false, nextPageFailed: true });
		}
	};

	return {
		loadNextPage,
		reset,
	};
}
