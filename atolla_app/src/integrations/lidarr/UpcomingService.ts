import type { KeyValueStore } from 'atolla_core/src/stores/KeyValueStore';
import { localDateKey } from '../../services/OnThisDayService';
import { formatReleaseDate } from '../../utils/Date';
import type { LidarrClient } from './Client';
import { toUpcomingAlbums, type UpcomingAlbum } from './Upcoming';

const CACHE_KEY = 'upcoming_v1';
const UPCOMING_LOOKAHEAD_DAYS = 90;

export class UpcomingService {
	private cached: Array<UpcomingAlbum> = [];
	private loading: Promise<void> | null = null;

	constructor(private readonly store: KeyValueStore) {}

	albums(now: Date): Array<UpcomingAlbum> {
		const today = localDateKey(now);
		return this.cached.filter((album) => (formatReleaseDate(album.releaseDate) ?? '') >= today);
	}

	async clear(): Promise<void> {
		await this.ensureLoaded();
		this.cached = [];
		await this.store.storeString(CACHE_KEY, '[]');
	}

	ensureLoaded(): Promise<void> {
		if (this.loading === null) {
			this.loading = this.load();
		}
		return this.loading;
	}

	async refresh(client: LidarrClient, now: Date): Promise<void> {
		await this.ensureLoaded();
		const start = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
		const end = Date.UTC(
			now.getFullYear(),
			now.getMonth(),
			now.getDate() + UPCOMING_LOOKAHEAD_DAYS,
		);
		const albums = await client.calendar(
			new Date(start).toISOString(),
			new Date(end).toISOString(),
		);
		this.cached = toUpcomingAlbums(albums);
		await this.store.storeString(CACHE_KEY, JSON.stringify(this.cached));
	}

	private async load(): Promise<void> {
		try {
			this.cached = JSON.parse(await this.store.fetchString(CACHE_KEY)) as Array<UpcomingAlbum>;
		} catch {
			this.cached = [];
		}
	}
}
