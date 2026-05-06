import 'jasmine/src/jasmine';
import type { Album } from 'atolla/src/models/Album';
import type { Track } from 'atolla/src/models/Track';
import type { Palette } from 'atolla/src/services/color/types';
import { PaletteGenerationQueue } from 'atolla/src/services/PaletteGenerationQueue';

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

const MOCK_PALETTE_JSON = JSON.stringify(MOCK_PALETTE);

async function tick() {
	await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

// --- Tests ---

describe('PaletteGenerationQueue', () => {
	let extractFromCache: jasmine.Spy;

	beforeEach(() => {
		extractFromCache = jasmine.createSpy('extractFromCache').and.returnValue('');
	});

	function makeQueue(service = createMockPaletteService()) {
		return { queue: new PaletteGenerationQueue(service as never, extractFromCache), service };
	}

	describe('enqueue', () => {
		it('skips a URL whose palette already exists', async () => {
			const service = createMockPaletteService();
			service._palettes.set('https://example.com/art.jpg', MOCK_PALETTE);
			const { queue } = makeQueue(service);

			queue.enqueue('https://example.com/art.jpg');
			await tick();

			expect(extractFromCache).not.toHaveBeenCalled();
		});

		it('skips a null or undefined URL', async () => {
			const { queue } = makeQueue();

			queue.enqueue(null);
			queue.enqueue(undefined);
			await tick();

			expect(extractFromCache).not.toHaveBeenCalled();
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

			const calls = extractFromCache.calls.allArgs().map((args) => args[0] as string);
			expect(calls).toContain('https://example.com/new.jpg');
			expect(calls).not.toContain('https://example.com/existing.jpg');
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

			const calls = extractFromCache.calls.allArgs().map((args) => args[0] as string);
			expect(calls.filter((u) => u === 'https://example.com/art.jpg').length).toBe(1);
			expect(calls).toContain('https://example.com/other.jpg');
		});
	});

	describe('native palette extraction', () => {
		it('calls persistPalette with the native palette when available', async () => {
			extractFromCache.and.returnValue(MOCK_PALETTE_JSON);
			const { queue, service } = makeQueue();

			queue.enqueue('https://example.com/art.jpg');
			await tick();

			expect(service.persistPalette).toHaveBeenCalledWith(
				'https://example.com/art.jpg',
				MOCK_PALETTE,
			);
		});

		it('skips persistPalette when native returns null', async () => {
			const { queue, service } = makeQueue();

			queue.enqueue('https://example.com/art.jpg');
			await tick();

			expect(service.persistPalette).not.toHaveBeenCalled();
		});

		it('skips persistPalette when native JSON is missing primary', async () => {
			extractFromCache.and.returnValue(JSON.stringify({ surface: { hex: '#880000' } }));
			const { queue, service } = makeQueue();

			queue.enqueue('https://example.com/art.jpg');
			await tick();

			expect(service.persistPalette).not.toHaveBeenCalled();
		});
	});
});
