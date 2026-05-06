import type { Album } from '../models/Album';
import type { Track } from '../models/Track';
import type { ArtworkPaletteService } from './ArtworkPaletteService';
import type { Palette } from './color/types';

const FAST_PATH_CONCURRENCY = 4;

export class PaletteGenerationQueue {
	private queue: Array<string> = [];
	private fastPathInFlight = 0;

	constructor(
		private readonly paletteService: ArtworkPaletteService,
		private readonly extractFromCache: (url: string, category: string) => string,
	) {}

	// Push to the front of the queue (used when an album page is opened).
	prioritize(imageUrl: string | null | undefined): void {
		if (!imageUrl || this.paletteService.hasPalette(imageUrl)) return;
		this.queue = [imageUrl, ...this.queue.filter((u) => u !== imageUrl)];
		this.processNext();
	}

	enqueue(imageUrl: string | null | undefined): void {
		if (!imageUrl || this.paletteService.hasPalette(imageUrl)) return;
		if (!this.queue.includes(imageUrl)) {
			this.queue.push(imageUrl);
		}
		this.processNext();
	}

	// Append albums to the queue (used when an artist page is opened).
	enqueueAlbums(albums: Array<Album>): void {
		const queued = new Set(this.queue);
		for (const album of albums) {
			if (
				album.imageUrl &&
				!this.paletteService.hasPalette(album.imageUrl) &&
				!queued.has(album.imageUrl)
			) {
				this.queue.push(album.imageUrl);
				queued.add(album.imageUrl);
			}
		}
		this.processNext();
	}

	// Append unique album art URLs from playlist tracks (used when a playlist is opened).
	enqueuePlaylistTracks(tracks: Array<Track>): void {
		const queued = new Set(this.queue);
		const seen = new Set<string>();
		for (const track of tracks) {
			const url = track.albumImageUrl;
			if (url && !this.paletteService.hasPalette(url) && !queued.has(url) && !seen.has(url)) {
				seen.add(url);
				this.queue.push(url);
				queued.add(url);
			}
		}
		this.processNext();
	}

	private processNext(): void {
		while (this.fastPathInFlight < FAST_PATH_CONCURRENCY && this.queue.length > 0) {
			// biome-ignore lint/style/noNonNullAssertion: length checked above
			const url = this.queue.shift()!;
			this.fastPathInFlight += 1;
			void this.processUrl(url).finally(() => {
				this.fastPathInFlight -= 1;
				this.processNext();
			});
		}
	}

	private async processUrl(url: string): Promise<void> {
		if (this.paletteService.hasPalette(url)) return;

		const nativePalette = this.extractNativePalette(url);
		if (nativePalette) {
			await this.paletteService.persistPalette(url, nativePalette);
		}
	}

	dispose(): void {
		this.queue = [];
	}

	private extractNativePalette(url: string): Palette | null {
		try {
			const raw = this.extractFromCache(url, 'album_art');
			if (!raw) return null;
			const parsed = JSON.parse(raw) as Partial<Palette>;
			if (!parsed.primary?.hex) return null;
			return parsed as Palette;
		} catch {
			return null;
		}
	}
}
