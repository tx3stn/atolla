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

export const TRACK_PAGE_SIZE = 50;
