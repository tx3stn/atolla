import type { IWorkerServiceClient } from 'worker/src/IWorkerService';
import { startWorkerService } from 'worker/src/WorkerService';
import type { Album } from '../models/Album';
import type { Track } from '../models/Track';
import type { ArtworkPaletteService } from './ArtworkPaletteService';
import type { IPaletteNativeWorker } from './PaletteNativeWorker';
import { PaletteNativeWorkerEntryPoint } from './PaletteNativeWorker';

const CONCURRENCY = 2;

export class PaletteGenerationQueue {
	private queue: Array<string> = [];
	private queueSet = new Set<string>();
	private activeUrls = new Set<string>();
	private allWorkers: Array<IWorkerServiceClient<IPaletteNativeWorker>>;
	private idleWorkers: Array<IWorkerServiceClient<IPaletteNativeWorker>>;

	constructor(private readonly paletteService: ArtworkPaletteService) {
		this.allWorkers = Array.from({ length: CONCURRENCY }, () =>
			startWorkerService(PaletteNativeWorkerEntryPoint, []),
		);
		this.idleWorkers = [...this.allWorkers];
	}

	prioritize(imageUrl: string | null | undefined): void {
		if (!imageUrl || this.paletteService.hasPalette(imageUrl)) return;
		if (this.queueSet.has(imageUrl)) {
			this.queue = [imageUrl, ...this.queue.filter((u) => u !== imageUrl)];
		} else if (!this.activeUrls.has(imageUrl)) {
			this.queue = [imageUrl, ...this.queue];
			this.queueSet.add(imageUrl);
		}
		this.processNext();
	}

	enqueue(imageUrl: string | null | undefined): void {
		if (!imageUrl || this.paletteService.hasPalette(imageUrl)) return;
		if (!this.queueSet.has(imageUrl) && !this.activeUrls.has(imageUrl)) {
			this.queue.push(imageUrl);
			this.queueSet.add(imageUrl);
		}
		this.processNext();
	}

	enqueueAlbums(albums: Array<Album>): void {
		for (const album of albums) {
			if (
				album.imageUrl &&
				!this.paletteService.hasPalette(album.imageUrl) &&
				!this.queueSet.has(album.imageUrl) &&
				!this.activeUrls.has(album.imageUrl)
			) {
				this.queue.push(album.imageUrl);
				this.queueSet.add(album.imageUrl);
			}
		}
		this.processNext();
	}

	enqueuePlaylistTracks(tracks: Array<Track>): void {
		const seen = new Set<string>();
		for (const track of tracks) {
			const url = track.albumImageUrl;
			if (
				url &&
				!this.paletteService.hasPalette(url) &&
				!this.queueSet.has(url) &&
				!this.activeUrls.has(url) &&
				!seen.has(url)
			) {
				seen.add(url);
				this.queue.push(url);
				this.queueSet.add(url);
			}
		}
		this.processNext();
	}

	dispose(): void {
		this.queue = [];
		this.queueSet.clear();
		for (const worker of this.allWorkers) worker.dispose();
	}

	private processNext(): void {
		while (this.idleWorkers.length > 0 && this.queue.length > 0) {
			// biome-ignore lint/style/noNonNullAssertion: both lengths checked above
			const worker = this.idleWorkers.pop()!;
			// biome-ignore lint/style/noNonNullAssertion: both lengths checked above
			const url = this.queue.shift()!;
			this.queueSet.delete(url);
			this.activeUrls.add(url);
			void this.process(worker, url).finally(() => {
				this.activeUrls.delete(url);
				this.idleWorkers.push(worker);
				this.processNext();
			});
		}
	}

	private async process(
		worker: IWorkerServiceClient<IPaletteNativeWorker>,
		url: string,
	): Promise<void> {
		if (this.paletteService.hasPalette(url)) return;
		try {
			const palette = await worker.api.extractPalette(url, 'album_art');
			if (palette) {
				await this.paletteService.persistPalette(url, palette);
			}
		} catch {
			// extraction failures are silent
		}
	}
}
