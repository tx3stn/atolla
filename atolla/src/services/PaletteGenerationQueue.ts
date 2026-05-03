import { AssetOutputType, addAssetLoadObserver } from 'valdi_core/src/Asset';
import type { IWorkerServiceClient } from 'worker/src/IWorkerService';
import { startWorkerService } from 'worker/src/WorkerService';
import { extractAtollaPaletteFromCache } from '../ImageLoaderBootstrap';
import { detectMimeType } from '../images/MimeType';
import type { Album } from '../models/Album';
import type { Track } from '../models/Track';
import type { ArtworkPaletteService } from './ArtworkPaletteService';
import { legibleTextColor, mutedTextColor, mutedVariant } from './color/colorUtils';
import type { Palette } from './color/types';
import { buildImageSource } from './ImageSource';
import type { IPaletteWorker } from './PaletteGenerationWorker';
import { PaletteWorkerEntryPoint } from './PaletteGenerationWorker';

const SLOW_PATH_CONCURRENCY = 2;

export class PaletteGenerationQueue {
	private queue: Array<string> = [];
	private slowPathQueue: Array<string> = [];
	private slowPathInFlight = new Set<string>();
	private idleSlowPathWorkers: Array<IWorkerServiceClient<IPaletteWorker>>;

	constructor(private readonly paletteService: ArtworkPaletteService) {
		this.idleSlowPathWorkers = Array.from({ length: SLOW_PATH_CONCURRENCY }, () =>
			startWorkerService(PaletteWorkerEntryPoint, []),
		);
	}

	dispose(): void {
		for (const worker of this.idleSlowPathWorkers) worker.dispose();
	}

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
		if (this.queue.length === 0) return;

		const pending = this.queue;
		this.queue = [];
		for (const url of pending) {
			void this.processUrl(url);
		}
	}

	private async processUrl(url: string): Promise<void> {
		if (this.paletteService.hasPalette(url)) return;

		// Fast path: native pre-computed palette (no worker needed).
		const nativePalette = this.extractNativePalette(url);
		if (nativePalette) {
			await this.paletteService.persistPalette(url, nativePalette);
			return;
		}

		this.enqueueSlowPath(url);
	}

	private enqueueSlowPath(url: string): void {
		if (
			this.paletteService.hasPalette(url) ||
			this.slowPathQueue.includes(url) ||
			this.slowPathInFlight.has(url)
		) {
			return;
		}
		this.slowPathQueue.push(url);
		this.processSlowPathQueue();
	}

	private processSlowPathQueue(): void {
		while (this.idleSlowPathWorkers.length > 0 && this.slowPathQueue.length > 0) {
			// biome-ignore lint/style/noNonNullAssertion: both lengths checked above
			const worker = this.idleSlowPathWorkers.pop()!;
			// biome-ignore lint/style/noNonNullAssertion: both lengths checked above
			const url = this.slowPathQueue.shift()!;
			this.slowPathInFlight.add(url);
			void this.processSlowPathUrl(worker, url).finally(() => {
				this.slowPathInFlight.delete(url);
				this.idleSlowPathWorkers.push(worker);
				this.processSlowPathQueue();
			});
		}
	}

	private async processSlowPathUrl(
		worker: IWorkerServiceClient<IPaletteWorker>,
		url: string,
	): Promise<void> {
		if (this.paletteService.hasPalette(url)) return;

		const entry = await this.loadBuffer(url);
		if (!entry) return;

		const palette = await worker.api.computePalette(entry.buffer, entry.mimeType);
		if (palette) {
			await this.paletteService.persistPalette(url, palette);
		}
	}

	private extractNativePalette(url: string): Palette | null {
		try {
			const raw = extractAtollaPaletteFromCache(url, 'album_art');
			if (!raw) return null;
			const parsed = JSON.parse(raw) as Partial<Palette>;
			if (!parsed.primary?.hex) return null;
			const primary = { hex: parsed.primary.hex };
			const surface = mutedVariant(primary);
			const onSurface = legibleTextColor(surface);
			const accentHex = parsed.accent?.hex ?? parsed.primary.hex;
			return {
				accent: { hex: accentHex },
				muted_on_surface: mutedTextColor(onSurface, surface),
				on_surface: onSurface,
				primary,
				surface,
			};
		} catch {
			return null;
		}
	}

	private loadBuffer(url: string): Promise<{ buffer: ArrayBuffer; mimeType: string } | null> {
		const source = buildImageSource(url, 'album_art', { cacheOnly: true });
		return new Promise((resolve) => {
			let subscription: { unsubscribe(): void } | undefined;
			subscription = addAssetLoadObserver(
				source,
				(loadedAsset: unknown, error: string | undefined) => {
					subscription?.unsubscribe();
					if (error || !loadedAsset) {
						resolve(null);
						return;
					}
					const bytes = loadedAsset as Uint8Array;
					const buffer = bytes.buffer.slice(
						bytes.byteOffset,
						bytes.byteOffset + bytes.byteLength,
					) as ArrayBuffer;
					resolve({ buffer, mimeType: detectMimeType(bytes, url) });
				},
				AssetOutputType.BYTES,
			);
		});
	}
}
