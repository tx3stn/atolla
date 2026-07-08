import { describe, expect, it } from 'bun:test';
import type { Palette } from '../models/Color';
import type { PaletteStore } from './ArtworkPaletteService';
import { WriteBehindPaletteStore } from './WriteBehindPaletteStore';

const palette: Palette = {
	accent: { hex: '#ff0000' },
	muted_on_surface: { hex: '#888888' },
	on_surface: { hex: '#ffffff' },
	surface: { hex: '#000000' },
};

class CapturingStore implements PaletteStore {
	saved: Array<{ url: string; palette: Palette }> = [];
	seeded = new Map<string, Palette>();
	resolvers: Array<() => void> = [];
	loadCalls = 0;

	loadPalette(url: string): Promise<Palette | null> {
		this.loadCalls += 1;
		return Promise.resolve(this.seeded.get(url) ?? null);
	}

	savePalette(url: string, p: Palette): Promise<void> {
		return new Promise((resolve) => {
			this.resolvers.push(() => {
				this.saved.push({ palette: p, url });
				resolve();
			});
		});
	}

	clearAll(): Promise<void> {
		return Promise.resolve();
	}

	flush(): void {
		for (const resolve of this.resolvers) resolve();
		this.resolvers = [];
	}
}

describe('WriteBehindPaletteStore', () => {
	describe('savePalette()', () => {
		it('returns immediately without waiting for the inner store', async () => {
			const inner = new CapturingStore();
			const store = new WriteBehindPaletteStore(inner);

			await store.savePalette('https://example.com/art.png', palette);

			// inner has not resolved yet, still pending
			expect(inner.saved).toHaveLength(0);
		});

		it('eventually writes to the inner store in the background', async () => {
			const inner = new CapturingStore();
			const store = new WriteBehindPaletteStore(inner);

			void store.savePalette('https://example.com/art.png', palette);
			inner.flush();
			await Promise.resolve();

			expect(inner.saved).toHaveLength(1);
			expect(inner.saved[0].url).toBe('https://example.com/art.png');
		});

		it('does not propagate errors from the inner store', async () => {
			const inner: PaletteStore = {
				clearAll: () => Promise.resolve(),
				loadPalette: () => Promise.resolve(null),
				savePalette: () => Promise.reject(new Error('disk full')),
			};
			const store = new WriteBehindPaletteStore(inner);

			await expect(store.savePalette('url', palette)).resolves.toBeUndefined();
		});

		it('makes the palette available from memory immediately', async () => {
			const inner = new CapturingStore();
			const store = new WriteBehindPaletteStore(inner);

			void store.savePalette('https://example.com/art.png', palette);
			const result = await store.loadPalette('https://example.com/art.png');

			expect(result).toEqual(palette);
			expect(inner.loadCalls).toBe(0);
		});
	});

	describe('loadPalette()', () => {
		it('delegates to the inner store and returns the palette', async () => {
			const inner = new CapturingStore();
			inner.seeded.set('https://example.com/art.png', palette);
			const store = new WriteBehindPaletteStore(inner);

			const result = await store.loadPalette('https://example.com/art.png');

			expect(result).toEqual(palette);
		});

		it('returns null for unknown urls', async () => {
			const store = new WriteBehindPaletteStore(new CapturingStore());

			expect(await store.loadPalette('https://example.com/missing.png')).toBeNull();
		});

		it('hydrates memory from inner store and serves subsequent reads from memory', async () => {
			const inner = new CapturingStore();
			inner.seeded.set('https://example.com/art.png', palette);
			const store = new WriteBehindPaletteStore(inner);

			const first = await store.loadPalette('https://example.com/art.png');
			const second = await store.loadPalette('https://example.com/art.png');

			expect(first).toEqual(palette);
			expect(second).toEqual(palette);
			expect(inner.loadCalls).toBe(1);
		});
	});
});
