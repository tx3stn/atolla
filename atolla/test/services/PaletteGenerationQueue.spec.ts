import 'jasmine/src/jasmine';
import type { Album } from 'atolla/src/models/Album';
import type { Track } from 'atolla/src/models/Track';
import type { Palette } from 'atolla/src/services/color/types';
import { PaletteGenerationQueue } from 'atolla/src/services/PaletteGenerationQueue';
import type { IPaletteNativeWorker } from 'atolla/src/services/PaletteNativeWorker';
import type { IWorkerServiceClient } from 'worker/src/IWorkerService';
import * as WorkerService from 'worker/src/WorkerService';

// --- Helpers ---

type MockWorker = IWorkerServiceClient<IPaletteNativeWorker> & {
	api: { extractPalette: jasmine.Spy };
	dispose: jasmine.Spy;
};

const MOCK_PALETTE: Palette = {
	accent: { hex: '#ff0000' },
	muted_on_surface: { hex: '#cccccc' },
	on_surface: { hex: '#ffffff' },
	primary: { hex: '#ff0000' },
	surface: { hex: '#880000' },
};

function createMockWorker(
	extractImpl: () => Promise<Palette | null> = () => Promise.resolve(null),
): MockWorker {
	return {
		api: {
			extractPalette: jasmine.createSpy('extractPalette').and.callFake(extractImpl),
		},
		dispose: jasmine.createSpy('dispose'),
		serviceId: 0,
	};
}

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

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, reject, resolve };
}

async function tick() {
	await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

// --- Tests ---

describe('PaletteGenerationQueue', () => {
	let workers: Array<MockWorker>;

	beforeEach(() => {
		workers = [];
		// biome-ignore lint/suspicious/noExplicitAny: spy returns mock, not the full generic type
		spyOn(WorkerService, 'startWorkerService').and.callFake((): any => {
			const w = createMockWorker();
			workers.push(w);
			return w;
		});
	});

	function makeQueue(service = createMockPaletteService()) {
		const queue = new PaletteGenerationQueue(service as never);
		return { queue, service, workers: [...workers] };
	}

	describe('enqueue', () => {
		it('skips a URL whose palette already exists', async () => {
			const service = createMockPaletteService();
			service._palettes.set('https://example.com/art.jpg', MOCK_PALETTE);
			const { queue, workers: w } = makeQueue(service);

			queue.enqueue('https://example.com/art.jpg');
			await tick();

			const allCalls = w.flatMap((worker) => worker.api.extractPalette.calls.allArgs());
			expect(allCalls.length).toBe(0);
			queue.dispose();
		});

		it('skips a null or undefined URL', async () => {
			const { queue, workers: w } = makeQueue();

			queue.enqueue(null);
			queue.enqueue(undefined);
			await tick();

			const allCalls = w.flatMap((worker) => worker.api.extractPalette.calls.allArgs());
			expect(allCalls.length).toBe(0);
			queue.dispose();
		});

		it('dispatches work to a worker immediately when a slot is free', async () => {
			const { queue, workers: w } = makeQueue();

			queue.enqueue('https://example.com/art.jpg');
			await tick();

			const allCalls = w.flatMap((worker) => worker.api.extractPalette.calls.allArgs());
			expect(allCalls.length).toBe(1);
			expect(allCalls[0][0]).toBe('https://example.com/art.jpg');
			expect(allCalls[0][1]).toBe('album_art');
			queue.dispose();
		});

		it('skips a URL already pending in the queue', async () => {
			const d = deferred<Palette | null>();
			const { queue, workers: w } = makeQueue();
			for (const worker of w) {
				worker.api.extractPalette.and.callFake(() => d.promise);
			}
			// Fill both worker slots.
			queue.enqueue('https://example.com/a.jpg');
			queue.enqueue('https://example.com/b.jpg');
			// c goes to the pending queue.
			queue.enqueue('https://example.com/c.jpg');
			// Enqueue c again — should be ignored.
			queue.enqueue('https://example.com/c.jpg');

			d.resolve(null);
			await tick();

			const cCalls = w
				.flatMap((worker) => worker.api.extractPalette.calls.allArgs())
				.filter(([url]) => url === 'https://example.com/c.jpg');
			expect(cCalls.length).toBe(1);
			queue.dispose();
		});

		it('calls persistPalette when the worker returns a palette', async () => {
			const { queue, workers: w, service } = makeQueue();
			for (const worker of w) {
				worker.api.extractPalette.and.returnValue(Promise.resolve(MOCK_PALETTE));
			}

			queue.enqueue('https://example.com/art.jpg');
			await tick();

			expect(service.persistPalette).toHaveBeenCalledWith(
				'https://example.com/art.jpg',
				MOCK_PALETTE,
			);
			queue.dispose();
		});

		it('skips persistPalette when the worker returns null', async () => {
			const { queue, service } = makeQueue();

			queue.enqueue('https://example.com/art.jpg');
			await tick();

			expect(service.persistPalette).not.toHaveBeenCalled();
			queue.dispose();
		});

		it('queues a third URL when both worker slots are busy', async () => {
			const d = deferred<Palette | null>();
			const { queue, workers: w } = makeQueue();
			for (const worker of w) {
				worker.api.extractPalette.and.callFake(() => d.promise);
			}

			queue.enqueue('https://example.com/a.jpg');
			queue.enqueue('https://example.com/b.jpg');
			queue.enqueue('https://example.com/c.jpg');
			await tick();

			const beforeCalls = w
				.flatMap((worker) => worker.api.extractPalette.calls.allArgs())
				.map(([url]) => url);
			expect(beforeCalls.length).toBe(2);
			expect(beforeCalls).not.toContain('https://example.com/c.jpg');

			d.resolve(null);
			await tick();

			const afterCalls = w
				.flatMap((worker) => worker.api.extractPalette.calls.allArgs())
				.map(([url]) => url);
			expect(afterCalls).toContain('https://example.com/c.jpg');
			queue.dispose();
		});
	});

	describe('prioritize', () => {
		it('moves a queued URL to the front', async () => {
			const d = deferred<Palette | null>();
			const callOrder: Array<string> = [];
			const { queue, workers: w } = makeQueue();
			for (const worker of w) {
				worker.api.extractPalette.and.callFake((url: string) => {
					callOrder.push(url);
					return d.promise;
				});
			}

			// Fill both worker slots; c and d sit pending.
			queue.enqueue('https://example.com/a.jpg');
			queue.enqueue('https://example.com/b.jpg');
			queue.enqueue('https://example.com/c.jpg');
			queue.enqueue('https://example.com/d.jpg');

			queue.prioritize('https://example.com/d.jpg');

			d.resolve(null);
			await tick();

			const cPos = callOrder.indexOf('https://example.com/c.jpg');
			const dPos = callOrder.indexOf('https://example.com/d.jpg');
			expect(dPos).toBeGreaterThanOrEqual(0);
			if (cPos >= 0) expect(dPos).toBeLessThan(cPos);

			queue.dispose();
		});
	});

	describe('enqueueAlbums', () => {
		it('enqueues only albums with image URLs that have no palette', async () => {
			const service = createMockPaletteService();
			service._palettes.set('https://example.com/existing.jpg', MOCK_PALETTE);
			const { queue, workers: w } = makeQueue(service);

			const albums: Array<Album> = [
				{ id: 'a1', imageUrl: 'https://example.com/new.jpg' } as Album,
				{ id: 'a2', imageUrl: 'https://example.com/existing.jpg' } as Album,
				{ id: 'a3', imageUrl: null } as unknown as Album,
			];

			queue.enqueueAlbums(albums);
			await tick();

			const calls = w
				.flatMap((worker) => worker.api.extractPalette.calls.allArgs())
				.map(([url]) => url as string);
			expect(calls).toContain('https://example.com/new.jpg');
			expect(calls).not.toContain('https://example.com/existing.jpg');
			queue.dispose();
		});
	});

	describe('enqueuePlaylistTracks', () => {
		it('deduplicates album art URLs across tracks in the same call', async () => {
			const { queue, workers: w } = makeQueue();

			const tracks: Array<Track> = [
				{ albumImageUrl: 'https://example.com/art.jpg', id: 't1' } as Track,
				{ albumImageUrl: 'https://example.com/art.jpg', id: 't2' } as Track,
				{ albumImageUrl: 'https://example.com/other.jpg', id: 't3' } as Track,
			];

			queue.enqueuePlaylistTracks(tracks);
			for (let i = 0; i < 5; i++) await tick();

			const calls = w
				.flatMap((worker) => worker.api.extractPalette.calls.allArgs())
				.map(([url]) => url as string);
			expect(calls.filter((u) => u === 'https://example.com/art.jpg').length).toBe(1);
			expect(calls).toContain('https://example.com/other.jpg');
			queue.dispose();
		});
	});

	describe('dispose', () => {
		it('disposes all workers', () => {
			const { queue, workers: w } = makeQueue();

			queue.dispose();

			for (const worker of w) {
				expect(worker.dispose).toHaveBeenCalledTimes(1);
			}
		});
	});
});
