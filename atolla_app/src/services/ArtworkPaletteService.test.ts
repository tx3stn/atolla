import { describe, expect, it } from 'bun:test';
import type { Palette } from '../models/Color';
import type { PaletteStorage } from '../stores/PaletteStore';
import { ArtworkPaletteService } from './ArtworkPaletteService';

class MockPaletteStore implements PaletteStorage {
	private data = new Map<string, Palette>();

	loadPalette(url: string): Promise<Palette | null> {
		return Promise.resolve(this.data.get(url) ?? null);
	}

	savePalette(url: string, palette: Palette): Promise<void> {
		this.data.set(url, palette);
		return Promise.resolve();
	}

	clearAll(): Promise<void> {
		this.data.clear();
		return Promise.resolve();
	}

	seed(url: string, palette: Palette): void {
		this.data.set(url, palette);
	}

	saved(url: string): Palette | undefined {
		return this.data.get(url);
	}
}

const SAMPLE_PALETTE: Palette = {
	accent: { hex: '#ff6b6b' },
	muted_on_surface: { hex: '#f4b7b7' },
	on_surface: { hex: '#ffe0e0' },
	surface: { hex: '#800000' },
};

describe('ArtworkPaletteService', () => {
	describe('getPalette()', () => {
		it('returns undefined before any image is processed', () => {
			const service = new ArtworkPaletteService(new MockPaletteStore());
			expect(service.getPalette('https://example.com/art.png')).toBeUndefined();
		});

		it('reports whether a palette is cached for a url', () => {
			const service = new ArtworkPaletteService(new MockPaletteStore());
			const url = 'https://example.com/art.png';

			expect(service.hasPalette(url)).toBe(false);
			service.persistPalette(url, SAMPLE_PALETTE);
			expect(service.hasPalette(url)).toBe(true);
		});

		// NowPlayingSurface only rebuilds its palette styles when the palette prop changes identity,
		// and OverlayHost calls getPalette on every render, so a fresh object per call would rebuild
		// 18 non-interned styles on every unrelated overlay render
		it('returns the same instance across calls for a persisted palette', () => {
			const service = new ArtworkPaletteService(new MockPaletteStore());
			const url = 'https://example.com/art.png';
			service.persistPalette(url, SAMPLE_PALETTE);

			expect(service.getPalette(url)).toBe(service.getPalette(url));
		});

		it('returns the same instance across calls for a warmed-up palette', async () => {
			const mockStore = new MockPaletteStore();
			const url = 'https://example.com/art.png';
			mockStore.seed(url, SAMPLE_PALETTE);

			const service = new ArtworkPaletteService(mockStore);
			await service.warmUp([url]);

			expect(service.getPalette(url)).toBe(service.getPalette(url));
		});

		it('returns undefined for null url', () => {
			const service = new ArtworkPaletteService(new MockPaletteStore());
			expect(service.getPalette(null)).toBeUndefined();
		});

		it('returns undefined for undefined url', () => {
			const service = new ArtworkPaletteService(new MockPaletteStore());
			expect(service.getPalette(undefined)).toBeUndefined();
		});
	});

	describe('warmUp()', () => {
		it('loads persisted palettes from the store', async () => {
			const mockStore = new MockPaletteStore();
			const storedPalette: Palette = {
				accent: { hex: '#ff6b6b' },
				muted_on_surface: { hex: '#f4b7b7' },
				on_surface: { hex: '#ffe0e0' },
				surface: { hex: '#800000' },
			};
			const url = 'https://example.com/art.png';
			mockStore.seed(url, storedPalette);

			const service = new ArtworkPaletteService(mockStore);
			await service.warmUp([url]);

			expect(service.getPalette(url)).toEqual(storedPalette);
		});

		it('backfills muted_on_surface for persisted palettes from older schema', async () => {
			const mockStore = new MockPaletteStore();
			const url = 'https://example.com/art-legacy.png';
			mockStore.seed(url, {
				on_surface: { hex: '#d8dee9' },
				surface: { hex: '#111a2b' },
			} as unknown as Palette);

			const service = new ArtworkPaletteService(mockStore);
			await service.warmUp([url]);

			expect(service.getPalette(url)?.muted_on_surface.hex).toBeDefined();
		});

		it('backfills accent for persisted palettes from older schema', async () => {
			const mockStore = new MockPaletteStore();
			const url = 'https://example.com/art-legacy-accent.png';
			mockStore.seed(url, {
				muted_on_surface: { hex: '#9aa3b2' },
				on_surface: { hex: '#d8dee9' },
				surface: { hex: '#111a2b' },
			} as unknown as Palette);

			const service = new ArtworkPaletteService(mockStore);
			await service.warmUp([url]);

			expect(service.getPalette(url)?.accent.hex).toBe('#111a2b');
		});

		it('notifies subscribers after warm-up loads a palette', async () => {
			const mockStore = new MockPaletteStore();
			const url = 'https://example.com/art.png';
			mockStore.seed(url, SAMPLE_PALETTE);

			const service = new ArtworkPaletteService(mockStore);
			let calls = 0;
			service.subscribe(() => calls++);
			await service.warmUp([url]);

			expect(calls).toBe(1);
		});

		it('notifies subscribers exactly once regardless of how many URLs are loaded', async () => {
			const mockStore = new MockPaletteStore();
			const urls = [
				'https://example.com/a.png',
				'https://example.com/b.png',
				'https://example.com/c.png',
			];
			for (const url of urls) mockStore.seed(url, SAMPLE_PALETTE);

			const service = new ArtworkPaletteService(mockStore);
			let calls = 0;
			service.subscribe(() => calls++);
			await service.warmUp(urls);

			expect(calls).toBe(1);
		});

		it('does not overwrite an already-cached palette during warm-up', async () => {
			const mockStore = new MockPaletteStore();
			const url = 'https://example.com/art.png';
			mockStore.seed(url, {
				accent: { hex: '#7f87ff' },
				muted_on_surface: { hex: '#2b2b2b' },
				on_surface: { hex: '#333333' },
				surface: { hex: '#222222' },
			});

			const service = new ArtworkPaletteService(mockStore);
			service.persistPalette(url, SAMPLE_PALETTE);
			const afterPersist = service.getPalette(url);

			await service.warmUp([url]);
			expect(service.getPalette(url)).toEqual(afterPersist);
		});

		it('returns an unsubscribe function that stops notifications', () => {
			const service = new ArtworkPaletteService(new MockPaletteStore());
			let calls = 0;
			const unsub = service.subscribe(() => calls++);
			unsub();

			const service2 = new ArtworkPaletteService(new MockPaletteStore());
			service2.subscribe(() => calls++);
			const unsub2 = service2.subscribe(() => calls++);
			unsub2();
			service2.persistPalette('u', SAMPLE_PALETTE);
			expect(calls).toBe(1); // only the non-unsubscribed listener fires
		});
	});

	// palettes are pre-extracted for the whole library as artwork is cached, but the only consumer
	// renders one URL at a time. an identity-free notification forces it to treat all of them as
	// relevant, so the URL has to travel with the notification for it to filter
	describe('notification payload', () => {
		it('tells listeners which url was persisted', () => {
			const service = new ArtworkPaletteService(new MockPaletteStore());
			const notified: Array<string | undefined> = [];
			service.subscribe((imageUrl) => notified.push(imageUrl));

			service.persistPalette('https://example.com/a.png', SAMPLE_PALETTE);

			expect(notified).toEqual(['https://example.com/a.png']);
		});

		// warm-up and clear both change many urls at once, so they carry no single url and every
		// listener has to treat them as relevant
		it('omits the url when warm-up loads palettes in bulk', async () => {
			const mockStore = new MockPaletteStore();
			mockStore.seed('https://example.com/a.png', SAMPLE_PALETTE);
			const service = new ArtworkPaletteService(mockStore);
			const notified: Array<string | undefined> = [];
			service.subscribe((imageUrl) => notified.push(imageUrl));

			await service.warmUp(['https://example.com/a.png']);

			expect(notified).toEqual([undefined]);
		});

		// warmUp runs per track play, so a miss must not announce a change that did not happen
		it('does not notify when warm-up loads nothing', async () => {
			const service = new ArtworkPaletteService(new MockPaletteStore());
			let calls = 0;
			service.subscribe(() => calls++);

			await service.warmUp(['https://example.com/never-persisted.png']);

			expect(calls).toBe(0);
		});

		it('does not notify when clearing an already-empty cache', async () => {
			const service = new ArtworkPaletteService(new MockPaletteStore());
			let calls = 0;
			service.subscribe(() => calls++);

			await service.clearAll();

			expect(calls).toBe(0);
		});

		it('omits the url when every palette is cleared', async () => {
			const service = new ArtworkPaletteService(new MockPaletteStore());
			service.persistPalette('https://example.com/a.png', SAMPLE_PALETTE);
			const notified: Array<string | undefined> = [];
			service.subscribe((imageUrl) => notified.push(imageUrl));

			await service.clearAll();

			expect(notified).toEqual([undefined]);
		});
	});
});
