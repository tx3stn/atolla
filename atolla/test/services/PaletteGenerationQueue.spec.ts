import 'jasmine/src/jasmine';
import type { Album } from 'atolla/src/models/Album';
import type { Track } from 'atolla/src/models/Track';
import type { Palette } from 'atolla/src/services/color/types';
import { PaletteGenerationQueue } from 'atolla/src/services/PaletteGenerationQueue';
import * as Asset from 'valdi_core/src/Asset';
import * as WorkerService from 'worker/src/WorkerService';

// --- Helpers ---

function createMockPaletteService() {
	const palettes = new Map<string, Palette>();
	return {
		_palettes: palettes,
		hasPalette: (url: string | null | undefined) => !!url && palettes.has(url),
		persistPalette: jasmine
			.createSpy('persistPalette')
			.and.callFake((url: string, palette: Palette) => {
				palettes.set(url, palette);
				return Promise.resolve();
			}),
	};
}

const MOCK_PALETTE: Palette = {
	accent: { hex: '#ff0000' },
	muted_on_surface: { hex: '#cccccc' },
	on_surface: { hex: '#ffffff' },
	primary: { hex: '#ff0000' },
	surface: { hex: '#880000' },
};

async function tick() {
	await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

// buildImageSource returns an atolla-cache:// string, e.g.
// "atolla-cache://image?c=album_art&u=https%3A%2F%2Fexample.com%2Fart.jpg&co=1"
function urlFromSource(src: string): string | null {
	const match = /[?&]u=([^&]*)/.exec(src);
	return match ? decodeURIComponent(match[1]) : null;
}

// --- Tests ---

describe('PaletteGenerationQueue', () => {
	let mockWorkerClient: { api: { computePalette: jasmine.Spy }; dispose: jasmine.Spy };

	beforeEach(() => {
		mockWorkerClient = {
			api: {
				computePalette: jasmine
					.createSpy('computePalette')
					.and.returnValue(Promise.resolve(MOCK_PALETTE)),
			},
			dispose: jasmine.createSpy('dispose'),
		};
		// biome-ignore lint/suspicious/noExplicitAny: spy return type differs from generic signature
		spyOn(WorkerService, 'startWorkerService').and.returnValue(mockWorkerClient as any);

		// Default: image load fails (resolves null) — native path also fails silently in test env.
		spyOn(Asset, 'addAssetLoadObserver').and.callFake((_source, callback) => {
			Promise.resolve().then(() => callback(undefined, 'not found'));
			return { unsubscribe: jasmine.createSpy('unsubscribe') };
		});
	});

	function makeQueue(service = createMockPaletteService()) {
		const queue = new PaletteGenerationQueue(service as never);
		return { queue, service };
	}

	describe('enqueue', () => {
		it('skips a URL whose palette already exists', async () => {
			const service = createMockPaletteService();
			service._palettes.set('https://example.com/art.jpg', MOCK_PALETTE);
			const { queue } = makeQueue(service);

			queue.enqueue('https://example.com/art.jpg');
			await tick();

			expect(Asset.addAssetLoadObserver).not.toHaveBeenCalled();
			queue.dispose();
		});

		it('skips a URL that is already pending in the queue', async () => {
			const { queue } = makeQueue();

			queue.enqueue('https://example.com/a.jpg');
			queue.enqueue('https://example.com/b.jpg');
			queue.enqueue('https://example.com/b.jpg');

			// Let sequential slow-path processing complete for all URLs.
			for (let i = 0; i < 5; i++) await tick();

			// addAssetLoadObserver called once per unique URL, not twice for b.jpg.
			const calls = (Asset.addAssetLoadObserver as jasmine.Spy).calls
				.allArgs()
				.map(([src]) => urlFromSource(src));
			expect(calls.filter((u) => u === 'https://example.com/b.jpg').length).toBe(1);
			queue.dispose();
		});

		it('skips a null or undefined URL', async () => {
			const { queue } = makeQueue();

			queue.enqueue(null);
			queue.enqueue(undefined);
			await tick();

			expect(Asset.addAssetLoadObserver).not.toHaveBeenCalled();
			queue.dispose();
		});
	});

	describe('enqueueAlbums', () => {
		it('enqueues only albums with image URLs that have no palette', async () => {
			const service = createMockPaletteService();
			service._palettes.set('https://example.com/existing.jpg', MOCK_PALETTE);
			const { queue } = makeQueue(service);

			const albums: Array<Album> = [
				{ id: 'a1', imageUrl: 'https://example.com/new.jpg' } as Album,
				{ id: 'a2', imageUrl: 'https://example.com/existing.jpg' } as Album,
				{ id: 'a3', imageUrl: null } as unknown as Album,
			];

			queue.enqueueAlbums(albums);
			await tick();

			const calls = (Asset.addAssetLoadObserver as jasmine.Spy).calls
				.allArgs()
				.map(([src]) => urlFromSource(src));
			expect(calls).toContain('https://example.com/new.jpg');
			expect(calls).not.toContain('https://example.com/existing.jpg');
			queue.dispose();
		});

		it('deduplicates URLs across multiple calls', async () => {
			// Block slow path so the URL stays pending on second call.
			(Asset.addAssetLoadObserver as jasmine.Spy).and.callFake((_source, _callback) => ({
				unsubscribe: jasmine.createSpy(),
			}));
			const { queue } = makeQueue();

			const albums: Array<Album> = [
				{ id: 'a1', imageUrl: 'https://example.com/shared.jpg' } as Album,
			];
			queue.enqueueAlbums(albums);
			queue.enqueueAlbums(albums);
			await tick();

			const calls = (Asset.addAssetLoadObserver as jasmine.Spy).calls
				.allArgs()
				.map(([src]) => urlFromSource(src))
				.filter((u) => u === 'https://example.com/shared.jpg');
			expect(calls.length).toBe(1);
			queue.dispose();
		});
	});

	describe('enqueuePlaylistTracks', () => {
		it('deduplicates album art URLs across tracks', async () => {
			const { queue } = makeQueue();

			const tracks: Array<Track> = [
				{ albumImageUrl: 'https://example.com/art.jpg', id: 't1' } as Track,
				{ albumImageUrl: 'https://example.com/art.jpg', id: 't2' } as Track,
				{ albumImageUrl: 'https://example.com/other.jpg', id: 't3' } as Track,
			];

			queue.enqueuePlaylistTracks(tracks);

			// Let sequential slow-path processing complete for all URLs.
			for (let i = 0; i < 5; i++) await tick();

			const calls = (Asset.addAssetLoadObserver as jasmine.Spy).calls
				.allArgs()
				.map(([src]) => urlFromSource(src));
			expect(calls.filter((u) => u === 'https://example.com/art.jpg').length).toBe(1);
			expect(calls).toContain('https://example.com/other.jpg');
			queue.dispose();
		});
	});

	describe('slow path (worker computation)', () => {
		beforeEach(() => {
			// Provide a valid image buffer via addAssetLoadObserver.
			const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
			(Asset.addAssetLoadObserver as jasmine.Spy).and.callFake((_source, callback) => {
				const sub = { unsubscribe: jasmine.createSpy('unsubscribe') };
				Promise.resolve().then(() => callback(pngBytes, undefined));
				return sub;
			});
		});

		it('calls persistPalette with the worker result', async () => {
			const { queue, service } = makeQueue();

			queue.enqueue('https://example.com/art.jpg');
			await tick();

			expect(mockWorkerClient.api.computePalette).toHaveBeenCalled();
			expect(service.persistPalette).toHaveBeenCalledWith(
				'https://example.com/art.jpg',
				MOCK_PALETTE,
			);
			queue.dispose();
		});

		it('skips persistPalette when the worker returns null', async () => {
			mockWorkerClient.api.computePalette.and.returnValue(Promise.resolve(null));
			const { queue, service } = makeQueue();

			queue.enqueue('https://example.com/art.jpg');
			await tick();

			expect(service.persistPalette).not.toHaveBeenCalled();
			queue.dispose();
		});

		it('processes slow-path URLs one at a time', async () => {
			let activeCount = 0;
			let maxActiveCount = 0;

			(Asset.addAssetLoadObserver as jasmine.Spy).and.callFake((_source, callback) => {
				activeCount++;
				maxActiveCount = Math.max(maxActiveCount, activeCount);
				const sub = { unsubscribe: jasmine.createSpy() };
				const pngBytes = new Uint8Array([0x89, 0x50]);
				Promise.resolve().then(() => {
					callback(pngBytes, undefined);
					activeCount--;
				});
				return sub;
			});

			const { queue } = makeQueue();
			queue.enqueue('https://example.com/a.jpg');
			queue.enqueue('https://example.com/b.jpg');
			queue.enqueue('https://example.com/c.jpg');

			// Drain multiple rounds to let sequential processing finish.
			for (let i = 0; i < 10; i++) await tick();

			expect(maxActiveCount).toBe(1);
			queue.dispose();
		});
	});

	describe('dispose', () => {
		it('calls dispose on the worker client', () => {
			const { queue } = makeQueue();

			queue.dispose();

			expect(mockWorkerClient.dispose).toHaveBeenCalledTimes(1);
		});
	});
});
