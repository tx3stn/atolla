import type { Track } from '../models/Track';
import { MAX_VISIBLE_QUEUE_TRACKS } from '../stores/Queue';

interface QueueState {
	addToQueue(tracks: Array<Track>): void;
	subscribe(listener: () => void): () => void;
	trackIndex: number;
	tracks: Array<Track>;
}

export type FetchPage = (
	page: number,
	pageSize: number,
) => Promise<{ hasMore: boolean; items: Array<Track> }>;

// how many recently-queued ids to remember for de-duping. Jellyfin's Random sort
// reshuffles every request, so consecutive pages overlap; dropping tracks seen in
// the last few pages stops obvious repeats (far-apart repeats are fine)
const DEDUPE_WINDOW_PAGES = 4;

// a page can come back fully de-duped; since nothing is added the store won't
// notify us to retry, so we re-fetch a bounded number of times
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
		// reset per-shuffle state so a fresh shuffle de-dupes from scratch, drops the old
		// subscription, and invalidates any in-flight fetch
		this.unsubscribe?.();
		this.generation += 1;
		this.isFetching = false;
		this.emptyPageRetries = 0;
		this.seenIds.clear();
		this.recentOrder.length = 0;
		this.nextPage = nextPage;
		this.hasMore = hasMore;
		// seed the de-dupe window with the already-queued tracks so the next page doesn't repeat them
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

	// record an id in the recently-seen window, evicting the oldest when full so a
	// track unseen for a few pages can appear again
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

		// refill once the upcoming tracks would no longer fill the now-playing surface's
		// visible queue, so the "up next" list never drains to a gap while there is more to load
		if (this.store.tracks.length - this.store.trackIndex > MAX_VISIBLE_QUEUE_TRACKS) {
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
					// whole page was already queued, so nothing was added and the store won't
					// notify us; advance to the next page ourselves
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
