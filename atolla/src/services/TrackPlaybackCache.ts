// @ts-nocheck
import { DEFAULT_TRACK_CACHE_MAX_TRACKS } from '../stores/Preferences';

declare const require: (moduleName: string) => {
	PersistentStore: new (
		name: string,
		options?: {
			maxWeight?: number;
		},
	) => TrackCacheStore;
};

interface TrackCacheStore {
	exists(key: string): Promise<boolean>;
	fetch(key: string): Promise<ArrayBuffer>;
	store(key: string, value: ArrayBuffer, ttlSeconds?: number, weight?: number): Promise<void>;
}

type TrackCacheStoreFactory = (maxTracks: number) => TrackCacheStore;

function createPersistentTrackStore(maxTracks: number): TrackCacheStore {
	try {
		const { PersistentStore } = require('persistence/src/PersistentStore');
		return new PersistentStore('track_playback_cache', {
			maxWeight: maxTracks,
		});
	} catch {
		return {
			exists: () => Promise.resolve(false),
			fetch: () => Promise.reject(new Error('track cache unavailable')),
			store: () => Promise.resolve(),
		};
	}
}

export class TrackPlaybackCache {
	private maxTracks: number;
	private store: TrackCacheStore;

	constructor(
		private readonly storeFactory: TrackCacheStoreFactory = createPersistentTrackStore,
		initialMaxTracks = DEFAULT_TRACK_CACHE_MAX_TRACKS,
	) {
		this.maxTracks = initialMaxTracks;
		this.store = this.storeFactory(this.maxTracks);
	}

	configureMaxTracks(maxTracks: number): void {
		if (!Number.isFinite(maxTracks) || maxTracks <= 0) {
			return;
		}

		if (maxTracks === this.maxTracks) {
			return;
		}

		this.maxTracks = maxTracks;
		this.store = this.storeFactory(maxTracks);
	}

	async hasTrack(trackId: string): Promise<boolean> {
		if (!trackId) {
			return false;
		}

		try {
			return await this.store.exists(this.storeKey(trackId));
		} catch {
			return false;
		}
	}

	async fetchTrack(trackId: string): Promise<ArrayBuffer | null> {
		if (!trackId) {
			return null;
		}

		try {
			return await this.store.fetch(this.storeKey(trackId));
		} catch {
			return null;
		}
	}

	async storeTrack(trackId: string, value: ArrayBuffer): Promise<void> {
		if (!trackId || value.byteLength === 0) {
			return;
		}

		try {
			await this.store.store(this.storeKey(trackId), value, undefined, 1);
		} catch {
			// best effort cache write
		}
	}

	private storeKey(trackId: string): string {
		return `track_file:${trackId}`;
	}
}
