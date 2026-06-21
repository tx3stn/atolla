import { isTrack, sanitizeTracks, type Track } from '../models/Track';
import { InMemoryKeyValueStore, type KeyValueStore } from './KeyValueStore';

export const RECENTLY_PLAYED_KEY = 'recently_played_tracks';
export const RECENTLY_PLAYED_LIMIT = 5;

// persistence for the home screen's recently-played list.
export class RecentlyPlayedStore {
	constructor(private store: KeyValueStore = new InMemoryKeyValueStore()) {}

	async load(): Promise<Array<Track>> {
		try {
			const raw = await this.store.fetchString(RECENTLY_PLAYED_KEY);
			const parsed = JSON.parse(raw);
			if (!Array.isArray(parsed)) {
				return [];
			}
			return sanitizeTracks(parsed.filter(isTrack).slice(0, RECENTLY_PLAYED_LIMIT));
		} catch {
			return [];
		}
	}

	async save(tracks: Array<Track>): Promise<void> {
		try {
			await this.store.storeString(
				RECENTLY_PLAYED_KEY,
				JSON.stringify(tracks.slice(0, RECENTLY_PLAYED_LIMIT)),
			);
		} catch {
			// best effort persistence
		}
	}

	// the raw persisted blob for the offline diagnostics export
	async loadRaw(): Promise<string | undefined> {
		try {
			return await this.store.fetchString(RECENTLY_PLAYED_KEY);
		} catch {
			return undefined;
		}
	}
}
