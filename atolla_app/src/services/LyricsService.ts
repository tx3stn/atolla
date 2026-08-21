import type { Lyrics } from 'atolla_core/src/models/Lyrics';
import type { Track } from 'atolla_core/src/models/Track';
import type { Transport } from 'atolla_core/src/transports/Transport';
import type { LyricsStorage } from '../stores/LyricsStore';

export interface LyricsServiceDeps {
	getTransport(): Transport;
	store: LyricsStorage;
}

export class LyricsService {
	private cache = new Map<string, Lyrics | null>();
	private inFlight = new Map<string, Promise<Lyrics | null>>();

	constructor(private deps: LyricsServiceDeps) {}

	cachedCount(): Promise<number> {
		return this.deps.store.count();
	}

	async clearAll(): Promise<void> {
		this.cache.clear();
		await this.deps.store.clearAll();
	}

	get(trackId: string): Lyrics | null | undefined {
		return this.cache.get(trackId);
	}

	load(track: Track): Promise<Lyrics | null> {
		const resident = this.cache.get(track.id);
		if (resident !== undefined) {
			return Promise.resolve(resident);
		}

		const existing = this.inFlight.get(track.id);
		if (existing) {
			return existing;
		}

		const request = this.resolve(track).finally(() => this.inFlight.delete(track.id));
		this.inFlight.set(track.id, request);

		return request;
	}

	prefetch(track: Track): void {
		if (track.hasLyrics === false || this.cache.has(track.id)) {
			return;
		}

		void this.load(track).catch(() => {});
	}

	private async resolve(track: Track): Promise<Lyrics | null> {
		const cached = await this.deps.store.loadLyrics(track.id);
		if (cached !== undefined) {
			this.cache.set(track.id, cached);
			return cached;
		}

		if (track.hasLyrics === false) {
			this.cache.set(track.id, null);
			return null;
		}

		const lyrics = await this.deps.getTransport().getLyrics(track.id);
		this.cache.set(track.id, lyrics);
		await this.deps.store.saveLyrics(track.id, lyrics);

		return lyrics;
	}
}
