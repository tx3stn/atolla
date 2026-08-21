import type { Lyrics } from 'atolla_core/src/models/Lyrics';

const version = 'v1';

export interface LyricsStorage {
	clearAll(): Promise<void>;
	count(): Promise<number>;
	loadLyrics(trackId: string): Promise<Lyrics | null | undefined>;
	saveLyrics(trackId: string, lyrics: Lyrics | null): Promise<void>;
}

export interface LyricsBackingStore {
	fetchAll(): Promise<Array<unknown> | Record<string, unknown>>;
	fetchString(key: string): Promise<string>;
	removeAll(): Promise<void>;
	storeString(key: string, value: string): Promise<void>;
}

export class LyricsStore implements LyricsStorage {
	constructor(private store: LyricsBackingStore) {}

	async clearAll(): Promise<void> {
		try {
			await this.store.removeAll();
		} catch {
			// best-effort
		}
	}

	async count(): Promise<number> {
		try {
			const all = await this.store.fetchAll();
			return Array.isArray(all) ? Math.floor(all.length / 2) : Object.keys(all).length;
		} catch {
			return 0;
		}
	}

	async loadLyrics(trackId: string): Promise<Lyrics | null | undefined> {
		let json: string;
		try {
			json = await this.store.fetchString(key(trackId));
		} catch {
			return undefined;
		}

		if (!json) return undefined;

		try {
			const parsed: unknown = JSON.parse(json);
			if (parsed === null) return null;
			return isLyrics(parsed) ? parsed : undefined;
		} catch {
			return undefined;
		}
	}

	async saveLyrics(trackId: string, lyrics: Lyrics | null): Promise<void> {
		try {
			await this.store.storeString(key(trackId), JSON.stringify(lyrics));
		} catch {
			// best-effort persistence
		}
	}
}

function key(trackId: string): string {
	return `${version}:${trackId}`;
}

function isLyrics(value: unknown): value is Lyrics {
	if (typeof value !== 'object' || value === null) return false;
	const candidate = value as Partial<Lyrics>;
	return Array.isArray(candidate.lines) && typeof candidate.synced === 'boolean';
}
