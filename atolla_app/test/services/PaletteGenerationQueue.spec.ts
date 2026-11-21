import 'jasmine/src/jasmine';
import type { Palette } from 'atolla_app/src/models/Color';
import { PaletteGenerationQueue } from 'atolla_app/src/services/PaletteGenerationQueue';
import type { IPaletteNativeWorker } from 'atolla_app/src/services/PaletteNativeWorker';
import type { Album } from 'atolla_core/src/models/Album';
import type { Track } from 'atolla_core/src/models/Track';
import type { IWorkerServiceClient } from 'worker/src/IWorkerService';
import * as WorkerService from 'worker/src/WorkerService';

type ExtractPalette = (id: string) => Promise<Palette | null>;

type MockWorker = IWorkerServiceClient<IPaletteNativeWorker> & {
	api: { extractPalette: jasmine.Spy };
	dispose: jasmine.Spy;
};

const MOCK_PALETTE: Palette = {
	accent: { hex: '#ff0000' },
	muted_on_surface: { hex: '#cccccc' },
	on_surface: { hex: '#ffffff' },
	surface: { hex: '#880000' },
};

function createMockWorker(extractPalette: ExtractPalette): MockWorker {
	return {
		api: {
			extractPalette: jasmine.createSpy('extractPalette').and.callFake(extractPalette),
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

describe('PaletteGenerationQueue', () => {
	let workers: Array<MockWorker>;
	let extractPalette: ExtractPalette;

	beforeEach(() => {
		workers = [];
		extractPalette = () => Promise.resolve(null);
		// biome-ignore lint/suspicious/noExplicitAny: spy returns mock, not the full generic type
		spyOn(WorkerService, 'startWorkerService').and.callFake((): any => {
			const w = createMockWorker((id) => extractPalette(id));
			workers.push(w);
			return w;
		});
	});

	function useWorkerBehaviour(fake: ExtractPalette): void {
		extractPalette = fake;
	}

	function makeQueue(service = createMockPaletteService()) {
		const queue = new PaletteGenerationQueue(service as never);
		return { queue, service };
	}

	function extractedIds(): Array<string> {
		return workers.flatMap((worker) => worker.api.extractPalette.calls.allArgs()).map(([id]) => id);
	}

	describe('enqueue', () => {
		it('skips a URL whose palette already exists', async () => {
			const service = createMockPaletteService();
			service._palettes.set('https://example.com/art.jpg', MOCK_PALETTE);
			const { queue } = makeQueue(service);

			queue.enqueue('album-art', 'https://example.com/art.jpg');
			await tick();

			expect(extractedIds().length).toBe(0);
			queue.dispose();
		});

		it('skips a null or undefined URL', async () => {
			const { queue } = makeQueue();

			queue.enqueue(null, null);
			queue.enqueue(undefined, undefined);
			await tick();

			expect(extractedIds().length).toBe(0);
			queue.dispose();
		});

		it('dispatches work to a worker immediately when a slot is free', async () => {
			const { queue } = makeQueue();

			queue.enqueue('album-art', 'https://example.com/art.jpg');
			await tick();

			const allCalls = workers.flatMap((worker) => worker.api.extractPalette.calls.allArgs());
			expect(allCalls.length).toBe(1);
			expect(allCalls[0][0]).toBe('album-art');
			expect(allCalls[0][1]).toBe('album_art');
			queue.dispose();
		});

		it('skips a URL already pending in the queue', async () => {
			const d = deferred<Palette | null>();
			useWorkerBehaviour(() => d.promise);
			const { queue } = makeQueue();
			// fill both worker slots
			queue.enqueue('album-a', 'https://example.com/a.jpg');
			queue.enqueue('album-b', 'https://example.com/b.jpg');
			// c goes to the pending queue
			queue.enqueue('album-c', 'https://example.com/c.jpg');
			// enqueue c again, should be ignored
			queue.enqueue('album-c', 'https://example.com/c.jpg');

			d.resolve(null);
			await tick();

			expect(extractedIds().filter((id) => id === 'album-c').length).toBe(1);
			queue.dispose();
		});

		it('calls persistPalette when the worker returns a palette', async () => {
			useWorkerBehaviour(() => Promise.resolve(MOCK_PALETTE));
			const { queue, service } = makeQueue();

			queue.enqueue('album-art', 'https://example.com/art.jpg');
			await tick();

			expect(service.persistPalette).toHaveBeenCalledWith(
				'https://example.com/art.jpg',
				MOCK_PALETTE,
			);
			queue.dispose();
		});

		it('skips persistPalette when the worker returns null', async () => {
			const { queue, service } = makeQueue();

			queue.enqueue('album-art', 'https://example.com/art.jpg');
			await tick();

			expect(service.persistPalette).not.toHaveBeenCalled();
			queue.dispose();
		});

		it('queues a third URL when both worker slots are busy', async () => {
			const d = deferred<Palette | null>();
			useWorkerBehaviour(() => d.promise);
			const { queue } = makeQueue();

			queue.enqueue('album-a', 'https://example.com/a.jpg');
			queue.enqueue('album-b', 'https://example.com/b.jpg');
			queue.enqueue('album-c', 'https://example.com/c.jpg');
			await tick();

			expect(workers.length).toBe(2);
			expect(extractedIds().length).toBe(2);
			expect(extractedIds()).not.toContain('album-c');

			d.resolve(null);
			await tick();

			expect(extractedIds()).toContain('album-c');
			queue.dispose();
		});
	});

	describe('prioritize', () => {
		it('moves a queued URL to the front', async () => {
			const d = deferred<Palette | null>();
			const callOrder: Array<string> = [];
			useWorkerBehaviour((id) => {
				callOrder.push(id);
				return d.promise;
			});
			const { queue } = makeQueue();

			// fill both worker slots; c and d sit pending
			queue.enqueue('album-a', 'https://example.com/a.jpg');
			queue.enqueue('album-b', 'https://example.com/b.jpg');
			queue.enqueue('album-c', 'https://example.com/c.jpg');
			queue.enqueue('album-d', 'https://example.com/d.jpg');

			queue.prioritize('album-d', 'https://example.com/d.jpg');

			d.resolve(null);
			await tick();

			const cPos = callOrder.indexOf('album-c');
			const dPos = callOrder.indexOf('album-d');
			expect(dPos).toBeGreaterThanOrEqual(0);
			if (cPos >= 0) expect(dPos).toBeLessThan(cPos);

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

			expect(extractedIds()).toContain('a1');
			expect(extractedIds()).not.toContain('a2');
			queue.dispose();
		});
	});

	describe('enqueuePlaylistTracks', () => {
		it('deduplicates album art URLs across tracks in the same call', async () => {
			const { queue } = makeQueue();

			const tracks: Array<Track> = [
				{ albumImageUrl: 'https://example.com/art.jpg', id: 't1' } as Track,
				{ albumImageUrl: 'https://example.com/art.jpg', id: 't2' } as Track,
				{ albumImageUrl: 'https://example.com/other.jpg', id: 't3' } as Track,
			];

			queue.enqueuePlaylistTracks(tracks);
			for (let i = 0; i < 5; i++) await tick();

			const ids = extractedIds();
			expect(ids.filter((id) => id === 'https://example.com/art.jpg').length).toBe(1);
			expect(ids).toContain('https://example.com/other.jpg');
			queue.dispose();
		});
	});

	describe('dispose', () => {
		it('disposes every worker it started', async () => {
			const d = deferred<Palette | null>();
			useWorkerBehaviour(() => d.promise);
			const { queue } = makeQueue();
			queue.enqueue('album-a', 'https://example.com/a.jpg');
			queue.enqueue('album-b', 'https://example.com/b.jpg');

			queue.dispose();
			d.resolve(null);
			await tick();

			expect(workers.length).toBe(2);
			for (const worker of workers) {
				expect(worker.dispose).toHaveBeenCalledTimes(1);
			}
		});
	});

	describe('workers', () => {
		it('starts no worker until something is queued', () => {
			makeQueue();

			expect(workers.length).toBe(0);
		});

		it('starts no worker for work queued after dispose', async () => {
			const { queue } = makeQueue();
			queue.dispose();

			queue.enqueue('album-art', 'https://example.com/art.jpg');
			await tick();

			expect(workers.length).toBe(0);
		});
	});
});
