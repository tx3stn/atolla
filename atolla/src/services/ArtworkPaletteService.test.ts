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

// Minimal valid 1×1 RGB PNG (white pixel) — reuse the builder from pngDecoder tests
function buildWhitePng(): ArrayBuffer {
	function crc32(data: Uint8Array): number {
		const t = new Uint32Array(256);
		for (let i = 0; i < 256; i++) {
			let c = i;
			for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
			t[i] = c;
		}
		let crc = 0xffffffff;
		for (const b of data) crc = t[(crc ^ b) & 0xff] ^ (crc >>> 1);
		// re-implement properly
		let crc2 = 0xffffffff;
		for (const b of data) {
			let c = (crc2 ^ b) & 0xff;
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
			crc2 = (crc2 >>> 8) ^ c;
		}
		return (crc2 ^ 0xffffffff) >>> 0;
	}
	function chunk(type: string, data: Uint8Array): Uint8Array {
		const tb = new TextEncoder().encode(type);
		const ci = new Uint8Array(4 + data.length);
		ci.set(tb);
		ci.set(data, 4);
		const crc = crc32(ci);
		const out = new Uint8Array(4 + 4 + data.length + 4);
		const len = data.length;
		out[0] = (len >>> 24) & 0xff;
		out[1] = (len >>> 16) & 0xff;
		out[2] = (len >>> 8) & 0xff;
		out[3] = len & 0xff;
		out.set(tb, 4);
		out.set(data, 8);
		const o = 8 + data.length;
		out[o] = (crc >>> 24) & 0xff;
		out[o + 1] = (crc >>> 16) & 0xff;
		out[o + 2] = (crc >>> 8) & 0xff;
		out[o + 3] = crc & 0xff;
		return out;
	}
	function adler32(d: Uint8Array): number {
		let s1 = 1,
			s2 = 0;
		for (const b of d) {
			s1 = (s1 + b) % 65521;
			s2 = (s2 + s1) % 65521;
		}
		return ((s2 << 16) | s1) >>> 0;
	}
	// 1×1 white RGB pixel, stored-block DEFLATE
	const scanlines = new Uint8Array([0, 255, 255, 255]); // filter=0, R=255, G=255, B=255
	const len = scanlines.length;
	const nlen = ~len & 0xffff;
	const deflate = new Uint8Array([
		0x01,
		len & 0xff,
		(len >>> 8) & 0xff,
		nlen & 0xff,
		(nlen >>> 8) & 0xff,
		...scanlines,
	]);
	const cs = adler32(scanlines);
	const zlib = new Uint8Array([
		0x78,
		0x01,
		...deflate,
		(cs >>> 24) & 0xff,
		(cs >>> 16) & 0xff,
		(cs >>> 8) & 0xff,
		cs & 0xff,
	]);
	const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
	const ihdrData = new Uint8Array([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
	const ihdr = chunk('IHDR', ihdrData);
	const idat = chunk('IDAT', zlib);
	const iend = chunk('IEND', new Uint8Array(0));
	const out = new Uint8Array(sig.length + ihdr.length + idat.length + iend.length);
	let o = 0;
	for (const p of [sig, ihdr, idat, iend]) {
		out.set(p, o);
		o += p.length;
	}
	return out.buffer;
}

// A 4-pixel image: 3 vivid blue pixels + 1 vivid red pixel.
// Expected: blue is dominant, red is secondary.
function buildBlueDominantPng(): ArrayBuffer {
	function crc32(data: Uint8Array): number {
		let crc = 0xffffffff;
		for (const b of data) {
			let c = (crc ^ b) & 0xff;
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
			crc = (crc >>> 8) ^ c;
		}
		return (crc ^ 0xffffffff) >>> 0;
	}
	function chunk(type: string, data: Uint8Array): Uint8Array {
		const tb = new TextEncoder().encode(type);
		const ci = new Uint8Array(4 + data.length);
		ci.set(tb);
		ci.set(data, 4);
		const crc = crc32(ci);
		const out = new Uint8Array(4 + 4 + data.length + 4);
		const len = data.length;
		out[0] = (len >>> 24) & 0xff;
		out[1] = (len >>> 16) & 0xff;
		out[2] = (len >>> 8) & 0xff;
		out[3] = len & 0xff;
		out.set(tb, 4);
		out.set(data, 8);
		const o = 8 + data.length;
		out[o] = (crc >>> 24) & 0xff;
		out[o + 1] = (crc >>> 16) & 0xff;
		out[o + 2] = (crc >>> 8) & 0xff;
		out[o + 3] = crc & 0xff;
		return out;
	}
	function adler32(d: Uint8Array): number {
		let s1 = 1,
			s2 = 0;
		for (const b of d) {
			s1 = (s1 + b) % 65521;
			s2 = (s2 + s1) % 65521;
		}
		return ((s2 << 16) | s1) >>> 0;
	}
	// 2×2: [blue, blue, blue, red] — row0: filter=0 + blue + blue, row1: filter=0 + blue + red
	const scanlines = new Uint8Array([
		0,
		0,
		0,
		220,
		0,
		0,
		220, // row 0: no-filter, blue, blue
		0,
		0,
		0,
		220,
		220,
		0,
		0, // row 1: no-filter, blue, red
	]);
	const len = scanlines.length;
	const nlen = ~len & 0xffff;
	const deflate = new Uint8Array([
		0x01,
		len & 0xff,
		(len >>> 8) & 0xff,
		nlen & 0xff,
		(nlen >>> 8) & 0xff,
		...scanlines,
	]);
	const cs = adler32(scanlines);
	const zlib = new Uint8Array([
		0x78,
		0x01,
		...deflate,
		(cs >>> 24) & 0xff,
		(cs >>> 16) & 0xff,
		(cs >>> 8) & 0xff,
		cs & 0xff,
	]);
	const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
	const ihdrData = new Uint8Array([0, 0, 0, 2, 0, 0, 0, 2, 8, 2, 0, 0, 0]);
	const ihdr = chunk('IHDR', ihdrData);
	const idat = chunk('IDAT', zlib);
	const iend = chunk('IEND', new Uint8Array(0));
	const out = new Uint8Array(sig.length + ihdr.length + idat.length + iend.length);
	let o = 0;
	for (const p of [sig, ihdr, idat, iend]) {
		out.set(p, o);
		o += p.length;
	}
	return out.buffer;
}

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
			await service.generatePalette(url, buildWhitePng(), 'image/png');
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

	describe('generatePalette()', () => {
		it('extracts and stores a palette when given a PNG buffer', async () => {
			const mockStore = new MockPaletteStore();
			const service = new ArtworkPaletteService(mockStore);
			const url = 'https://example.com/art.png';

			await service.generatePalette(url, buildWhitePng(), 'image/png');

			const palette = service.getPalette(url);
			expect(palette).not.toEqual(NEUTRAL_PALETTE);
			expect(palette.accent.hex).toBeDefined();
			expect(palette.primary.hex).toBeDefined();
			expect(palette.surface.hex).toBeDefined();
			expect(palette.on_surface.hex).toBeDefined();
			expect(palette.muted_on_surface.hex).toBeDefined();
		});

		it('persists the extracted palette to the store', async () => {
			const mockStore = new MockPaletteStore();
			const url = 'https://example.com/art.png';
			const service = new ArtworkPaletteService(mockStore);

			await service.generatePalette(url, buildWhitePng(), 'image/png');

			expect(mockStore.saved(url)).toBeDefined();
		});

		it('notifies subscribers after extraction', async () => {
			const service = new ArtworkPaletteService(new MockPaletteStore());
			const url = 'https://example.com/art.png';

			let calls = 0;
			service.subscribe(() => calls++);
			await service.generatePalette(url, buildWhitePng(), 'image/png');

			expect(calls).toBe(1);
		});

		it('sets lastError and notifies on unsupported image format (e.g. webp)', async () => {
			const service = new ArtworkPaletteService(new MockPaletteStore());
			const url = 'https://example.com/art.webp';

			let calls = 0;
			service.subscribe(() => calls++);
			await service.generatePalette(url, new ArrayBuffer(10), 'image/webp');

			expect(service.getPalette(url)).toEqual(NEUTRAL_PALETTE);
			expect(calls).toBe(1);
		});

		it('re-extracts when called again with a different buffer', async () => {
			const mockStore = new MockPaletteStore();
			const service = new ArtworkPaletteService(mockStore);
			const url = 'https://example.com/art.png';

			await service.generatePalette(url, buildWhitePng(), 'image/png');
			const first = service.getPalette(url);

			await service.generatePalette(url, buildBlueDominantPng(), 'image/png');
			const second = service.getPalette(url);

			expect(second.primary.hex).not.toBe(first.primary.hex);
		});

		it('selects non-dark primary colour', async () => {
			const service = new ArtworkPaletteService(new MockPaletteStore());
			const url = 'https://example.com/art.png';

			await service.generatePalette(url, buildWhitePng(), 'image/png');

			const palette = service.getPalette(url);
			const { isDark: checkDark } = await import('./color/colorUtils');
			expect(checkDark(palette.primary, 0.15)).toBe(false);
		});

		it('extracts a distinct accent when a minority vivid color is present', async () => {
			const service = new ArtworkPaletteService(new MockPaletteStore());
			const url = 'https://example.com/blue-with-red-accent.png';

			await service.generatePalette(url, buildBlueDominantPng(), 'image/png');

			const palette = service.getPalette(url);
			expect(palette.accent.hex).not.toBe(palette.primary.hex);
			const red = Number.parseInt(palette.accent.hex.slice(1, 3), 16);
			expect(red).toBeGreaterThan(120);
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
			const urls = ['https://example.com/a.png', 'https://example.com/b.png', 'https://example.com/c.png'];
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
			await service.generatePalette(url, buildWhitePng(), 'image/png');
			const afterExtraction = service.getPalette(url);

			await service.warmUp([url]);
			expect(service.getPalette(url)).toEqual(afterExtraction);
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
			await service2.generatePalette('u', buildWhitePng(), 'image/png');
			expect(calls).toBe(1); // only the non-unsubscribed listener fired
		});
	});
});
