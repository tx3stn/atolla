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
	appendItems: (
		current: Array<TItem>,
		pageItems: Array<TItem>,
		isFirstPage: boolean,
	) => Array<TItem>;
	fetchPage: (page: number) => Promise<PagedResult<TItem>>;
	getHasMore: () => boolean;
	getItems: () => Array<TItem>;
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

	const reset = (): void => {
		currentPage = 0;
		isLoadingPage = false;
	};

	const loadNextPage = async (): Promise<void> => {
		if (args.isDestroyed() || isLoadingPage || !args.getHasMore()) {
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
			args.onPageLoaded?.(page.items);

			const items = args.appendItems(args.getItems(), page.items, isFirstPage);
			args.setState({
				hasMore: page.hasMore,
				isLoadingNextPage: false,
				items,
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
