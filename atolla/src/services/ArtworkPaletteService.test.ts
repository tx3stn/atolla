import { describe, expect, it } from 'bun:test';
import { ArtworkPaletteService, type PaletteStore } from './ArtworkPaletteService';
import type { Palette } from './color/types';
import { NEUTRAL_PALETTE } from './color/types';

// ─── Test doubles ─────────────────────────────────────────────────────────────

class MockPaletteStore implements PaletteStore {
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
	primary: { hex: '#ff0000' },
	surface: { hex: '#800000' },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ArtworkPaletteService', () => {
	describe('getPalette()', () => {
		it('returns NEUTRAL_PALETTE before any image is processed', () => {
			const service = new ArtworkPaletteService(new MockPaletteStore());
			expect(service.getPalette('https://example.com/art.png')).toEqual(NEUTRAL_PALETTE);
		});

		it('reports whether a palette is cached for a url', async () => {
			const service = new ArtworkPaletteService(new MockPaletteStore());
			const url = 'https://example.com/art.png';

			expect(service.hasPalette(url)).toBe(false);
			await service.persistPalette(url, SAMPLE_PALETTE);
			expect(service.hasPalette(url)).toBe(true);
		});

		it('returns NEUTRAL_PALETTE for null url', () => {
			const service = new ArtworkPaletteService(new MockPaletteStore());
			expect(service.getPalette(null)).toEqual(NEUTRAL_PALETTE);
		});

		it('returns NEUTRAL_PALETTE for undefined url', () => {
			const service = new ArtworkPaletteService(new MockPaletteStore());
			expect(service.getPalette(undefined)).toEqual(NEUTRAL_PALETTE);
		});
	});

	describe('warmUp()', () => {
		it('loads persisted palettes from the store', async () => {
			const mockStore = new MockPaletteStore();
			const storedPalette: Palette = {
				accent: { hex: '#ff6b6b' },
				muted_on_surface: { hex: '#f4b7b7' },
				on_surface: { hex: '#ffe0e0' },
				primary: { hex: '#ff0000' },
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
				primary: { hex: '#ff0000' },
				surface: { hex: '#111a2b' },
			} as unknown as Palette);

			const service = new ArtworkPaletteService(mockStore);
			await service.warmUp([url]);

			expect(service.getPalette(url).muted_on_surface.hex).toBeDefined();
		});

		it('backfills accent for persisted palettes from older schema', async () => {
			const mockStore = new MockPaletteStore();
			const url = 'https://example.com/art-legacy-accent.png';
			mockStore.seed(url, {
				muted_on_surface: { hex: '#9aa3b2' },
				on_surface: { hex: '#d8dee9' },
				primary: { hex: '#8899aa' },
				surface: { hex: '#111a2b' },
			} as unknown as Palette);

			const service = new ArtworkPaletteService(mockStore);
			await service.warmUp([url]);

			expect(service.getPalette(url).accent.hex).toBe('#8899aa');
		});

		it('notifies subscribers after warm-up loads a palette', async () => {
			const mockStore = new MockPaletteStore();
			const url = 'https://example.com/art.png';
			mockStore.seed(url, NEUTRAL_PALETTE);

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
			for (const url of urls) mockStore.seed(url, NEUTRAL_PALETTE);

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
				primary: { hex: '#111111' },
				surface: { hex: '#222222' },
			});

			const service = new ArtworkPaletteService(mockStore);
			await service.persistPalette(url, SAMPLE_PALETTE);
			const afterPersist = service.getPalette(url);

			await service.warmUp([url]);
			expect(service.getPalette(url)).toEqual(afterPersist);
		});

		it('returns an unsubscribe function that stops notifications', async () => {
			const service = new ArtworkPaletteService(new MockPaletteStore());
			let calls = 0;
			const unsub = service.subscribe(() => calls++);
			unsub();

			const service2 = new ArtworkPaletteService(new MockPaletteStore());
			service2.subscribe(() => calls++);
			const unsub2 = service2.subscribe(() => calls++);
			unsub2();
			await service2.persistPalette('u', SAMPLE_PALETTE);
			expect(calls).toBe(1); // only the non-unsubscribed listener fired
		});
	});
});
