import type { Track } from '../models/Track';

interface QueueState {
	addToQueue(tracks: Array<Track>): void;
	subscribe(listener: () => void): () => void;
	trackIndex: number;
	tracks: Array<Track>;
}

type FetchPage = (
	page: number,
	pageSize: number,
) => Promise<{ hasMore: boolean; items: Array<Track> }>;

const PREFETCH_THRESHOLD = 10;

export const SHUFFLE_PAGE_SIZE = 50;

export class ShuffleQueueLoader {
	private generation = 0;
	private isFetching = false;
	private nextPage = 2;
	private hasMore = true;
	private unsubscribe: (() => void) | null = null;

	constructor(
		private readonly store: QueueState,
		private readonly fetchPage: FetchPage,
		private readonly pageSize: number,
	) {}

	start(nextPage: number, hasMore: boolean): void {
		this.nextPage = nextPage;
		this.hasMore = hasMore;
		this.unsubscribe = this.store.subscribe(() => this.onStoreChange());
		this.onStoreChange();
	}

	dispose(): void {
		this.generation++;
		this.unsubscribe?.();
		this.unsubscribe = null;
	}

	private onStoreChange(): void {
		if (!this.hasMore || this.isFetching) {
			return;
		}

		if (this.store.tracks.length === 0) {
			return;
		}

		const remaining = this.store.tracks.length - this.store.trackIndex;
		if (remaining > PREFETCH_THRESHOLD) {
			return;
		}

		this.isFetching = true;
		const generation = this.generation;
		const page = this.nextPage;

		this.fetchPage(page, this.pageSize)
			.then(({ hasMore, items }) => {
				if (generation !== this.generation) {
					return;
				}
				this.nextPage = page + 1;
				this.hasMore = hasMore;
				this.isFetching = false;
				if (items.length > 0) {
					this.store.addToQueue(items);
				}
			})
			.catch(() => {
				if (generation !== this.generation) {
					return;
				}
				this.isFetching = false;
			});
	}
}
