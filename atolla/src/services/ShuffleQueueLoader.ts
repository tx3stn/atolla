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

// How many recently-queued track ids to remember for de-duping. Jellyfin's Random sort
// reshuffles on every request, so consecutive pages overlap; we drop tracks seen within the
// last few pages so the queue doesn't obviously repeat. Far-apart repeats are acceptable.
const DEDUPE_WINDOW_PAGES = 4;

// A page can come back entirely de-duped (every track was recently queued). Since nothing is
// added, the store won't notify us to try again, so we re-fetch a bounded number of times.
const MAX_EMPTY_PAGE_RETRIES = 3;

export const SHUFFLE_PAGE_SIZE = 50;

export class ShuffleQueueLoader {
	private generation = 0;
	private isFetching = false;
	private nextPage = 2;
	private hasMore = true;
	private unsubscribe: (() => void) | null = null;
	private readonly seenIds = new Set<string>();
	private readonly recentOrder: Array<string> = [];
	private readonly dedupeWindow: number;
	private emptyPageRetries = 0;

	constructor(
		private readonly store: QueueState,
		private readonly fetchPage: FetchPage,
		private readonly pageSize: number,
	) {
		this.dedupeWindow = Math.max(1, pageSize) * DEDUPE_WINDOW_PAGES;
	}

	start(nextPage: number, hasMore: boolean): void {
		// Reset all per-shuffle state so a restart (a fresh shuffle) de-dupes from scratch rather
		// than against the previous shuffle's tracks, drops the old subscription, and invalidates
		// any in-flight fetch.
		this.unsubscribe?.();
		this.generation += 1;
		this.isFetching = false;
		this.emptyPageRetries = 0;
		this.seenIds.clear();
		this.recentOrder.length = 0;
		this.nextPage = nextPage;
		this.hasMore = hasMore;
		// Seed the de-dupe window with the already-queued tracks (page 1) so the next page
		// doesn't simply repeat them.
		for (const track of this.store.tracks.slice(-this.dedupeWindow)) {
			this.remember(track.id);
		}
		this.unsubscribe = this.store.subscribe(() => this.onStoreChange());
		this.onStoreChange();
	}

	dispose(): void {
		this.generation++;
		this.unsubscribe?.();
		this.unsubscribe = null;
	}

	// Records an id in the recently-seen window, evicting the oldest once the window is full so a
	// track that hasn't been queued for a few pages can appear again.
	private remember(id: string): void {
		if (this.seenIds.has(id)) {
			return;
		}
		this.seenIds.add(id);
		this.recentOrder.push(id);
		while (this.recentOrder.length > this.dedupeWindow) {
			const evicted = this.recentOrder.shift();
			if (evicted !== undefined) {
				this.seenIds.delete(evicted);
			}
		}
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

				const fresh: Array<Track> = [];
				for (const track of items) {
					if (this.seenIds.has(track.id)) {
						continue;
					}
					this.remember(track.id);
					fresh.push(track);
				}

				if (fresh.length > 0) {
					this.emptyPageRetries = 0;
					this.store.addToQueue(fresh);
				} else if (this.hasMore && this.emptyPageRetries < MAX_EMPTY_PAGE_RETRIES) {
					// The whole page was already queued, so adding nothing means the store won't
					// notify us to retry — advance to the next page ourselves.
					this.emptyPageRetries += 1;
					this.onStoreChange();
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
