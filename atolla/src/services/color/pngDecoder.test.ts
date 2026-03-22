import { describe, expect, it } from 'bun:test';
import { decodePng } from './pngDecoder';

// ─── PNG test fixture builder ─────────────────────────────────────────────────
// Generates valid minimal PNG files using uncompressed DEFLATE stored blocks.

function crc32(data: Uint8Array): number {
	let crc = 0xffffffff;
	for (const byte of data) {
		crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[i] = c;
	}
	return t;
})();

function adler32(data: Uint8Array): number {
	let s1 = 1;
	let s2 = 0;
	for (const byte of data) {
		s1 = (s1 + byte) % 65521;
		s2 = (s2 + s1) % 65521;
	}
	return ((s2 << 16) | s1) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
	const typeBytes = new TextEncoder().encode(type);
	const crcInput = new Uint8Array(4 + data.length);
	crcInput.set(typeBytes, 0);
	crcInput.set(data, 4);
	const crc = crc32(crcInput);
	const out = new Uint8Array(4 + 4 + data.length + 4);
	const len = data.length;
	out[0] = (len >>> 24) & 0xff;
	out[1] = (len >>> 16) & 0xff;
	out[2] = (len >>> 8) & 0xff;
	out[3] = len & 0xff;
	out.set(typeBytes, 4);
	out.set(data, 8);
	const o = 8 + data.length;
	out[o] = (crc >>> 24) & 0xff;
	out[o + 1] = (crc >>> 16) & 0xff;
	out[o + 2] = (crc >>> 8) & 0xff;
	out[o + 3] = crc & 0xff;
	return out;
}

function ihdrChunk(width: number, height: number, colorType: number, bitDepth = 8): Uint8Array {
	const d = new Uint8Array(13);
	d[0] = (width >>> 24) & 0xff;
	d[1] = (width >>> 16) & 0xff;
	d[2] = (width >>> 8) & 0xff;
	d[3] = width & 0xff;
	d[4] = (height >>> 24) & 0xff;
	d[5] = (height >>> 16) & 0xff;
	d[6] = (height >>> 8) & 0xff;
	d[7] = height & 0xff;
	d[8] = bitDepth;
	d[9] = colorType;
	return chunk('IHDR', d);
}

function idatChunk(scanlines: Uint8Array): Uint8Array {
	// Wrap in zlib (CMF=0x78, FLG=0x01) + DEFLATE stored block
	const len = scanlines.length;
	const nlen = ~len & 0xffff;
	const deflate = new Uint8Array(1 + 2 + 2 + len);
	deflate[0] = 0x01; // BFINAL=1, BTYPE=00 (stored)
	deflate[1] = len & 0xff;
	deflate[2] = (len >>> 8) & 0xff;
	deflate[3] = nlen & 0xff;
	deflate[4] = (nlen >>> 8) & 0xff;
	deflate.set(scanlines, 5);
	const checksum = adler32(scanlines);
	const zlib = new Uint8Array(2 + deflate.length + 4);
	zlib[0] = 0x78;
	zlib[1] = 0x01;
	zlib.set(deflate, 2);
	const oc = 2 + deflate.length;
	zlib[oc] = (checksum >>> 24) & 0xff;
	zlib[oc + 1] = (checksum >>> 16) & 0xff;
	zlib[oc + 2] = (checksum >>> 8) & 0xff;
	zlib[oc + 3] = checksum & 0xff;
	return chunk('IDAT', zlib);
}

const PNG_SIG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const IEND = chunk('IEND', new Uint8Array(0));

function buildRgbPng(width: number, height: number, rgbPixels: Uint8Array): ArrayBuffer {
	const stride = width * 3;
	const scanlines = new Uint8Array(height * (1 + stride));
	for (let row = 0; row < height; row++) {
		scanlines[row * (1 + stride)] = 0; // filter: None
		scanlines.set(rgbPixels.subarray(row * stride, (row + 1) * stride), row * (1 + stride) + 1);
	}
	const ihdr = ihdrChunk(width, height, 2 /* RGB */);
	const idat = idatChunk(scanlines);
	const out = new Uint8Array(PNG_SIG.length + ihdr.length + idat.length + IEND.length);
	let o = 0;
	for (const p of [PNG_SIG, ihdr, idat, IEND]) {
		out.set(p, o);
		o += p.length;
	}
	return out.buffer;
}

function buildRgbaPng(width: number, height: number, rgbaPixels: Uint8Array): ArrayBuffer {
	const stride = width * 4;
	const scanlines = new Uint8Array(height * (1 + stride));
	for (let row = 0; row < height; row++) {
		scanlines[row * (1 + stride)] = 0;
		scanlines.set(rgbaPixels.subarray(row * stride, (row + 1) * stride), row * (1 + stride) + 1);
	}
	const ihdr = ihdrChunk(width, height, 6 /* RGBA */);
	const idat = idatChunk(scanlines);
	const out = new Uint8Array(PNG_SIG.length + ihdr.length + idat.length + IEND.length);
	let o = 0;
	for (const p of [PNG_SIG, ihdr, idat, IEND]) {
		out.set(p, o);
		o += p.length;
	}
	return out.buffer;
}

function buildGrayscalePng(width: number, height: number, grayPixels: Uint8Array): ArrayBuffer {
	const scanlines = new Uint8Array(height * (1 + width));
	for (let row = 0; row < height; row++) {
		scanlines[row * (1 + width)] = 0;
		scanlines.set(grayPixels.subarray(row * width, (row + 1) * width), row * (1 + width) + 1);
	}
	const ihdr = ihdrChunk(width, height, 0 /* Grayscale */);
	const idat = idatChunk(scanlines);
	const out = new Uint8Array(PNG_SIG.length + ihdr.length + idat.length + IEND.length);
	let o = 0;
	for (const p of [PNG_SIG, ihdr, idat, IEND]) {
		out.set(p, o);
		o += p.length;
	}
	return out.buffer;
}

function buildIndexedPng(
	width: number,
	height: number,
	indices: Uint8Array,
	palette: Array<[number, number, number]>,
): ArrayBuffer {
	const plteData = new Uint8Array(palette.length * 3);
	for (let i = 0; i < palette.length; i++) {
		plteData[i * 3] = palette[i][0];
		plteData[i * 3 + 1] = palette[i][1];
		plteData[i * 3 + 2] = palette[i][2];
	}
	const scanlines = new Uint8Array(height * (1 + width));
	for (let row = 0; row < height; row++) {
		scanlines[row * (1 + width)] = 0;
		scanlines.set(indices.subarray(row * width, (row + 1) * width), row * (1 + width) + 1);
	}
	const ihdr = ihdrChunk(width, height, 3 /* Indexed */);
	const plte = chunk('PLTE', plteData);
	const idat = idatChunk(scanlines);
	const out = new Uint8Array(
		PNG_SIG.length + ihdr.length + plte.length + idat.length + IEND.length,
	);
	let o = 0;
	for (const p of [PNG_SIG, ihdr, plte, idat, IEND]) {
		out.set(p, o);
		o += p.length;
	}
	return out.buffer;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('decodePng - RGB (color type 2)', () => {
	it('decodes a 1x1 red pixel', () => {
		const pixels = new Uint8Array([255, 0, 0]);
		const rgba = decodePng(buildRgbPng(1, 1, pixels));
		expect(rgba[0]).toBe(255); // R
		expect(rgba[1]).toBe(0); // G
		expect(rgba[2]).toBe(0); // B
		expect(rgba[3]).toBe(255); // A (opaque)
	});

	it('decodes a 2x2 image with distinct corner colours', () => {
		// TL=red, TR=green, BL=blue, BR=white
		const pixels = new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]);
		const rgba = decodePng(buildRgbPng(2, 2, pixels));
		expect([rgba[0], rgba[1], rgba[2]]).toEqual([255, 0, 0]); // TL
		expect([rgba[4], rgba[5], rgba[6]]).toEqual([0, 255, 0]); // TR
		expect([rgba[8], rgba[9], rgba[10]]).toEqual([0, 0, 255]); // BL
		expect([rgba[12], rgba[13], rgba[14]]).toEqual([255, 255, 255]); // BR
	});

	it('outputs width * height * 4 bytes', () => {
		const pixels = new Uint8Array(3 * 3 * 3).fill(128);
		const rgba = decodePng(buildRgbPng(3, 3, pixels));
		expect(rgba.length).toBe(3 * 3 * 4);
	});
});

describe('decodePng - RGBA (color type 6)', () => {
	it('preserves alpha channel', () => {
		const pixels = new Uint8Array([200, 100, 50, 128]); // semi-transparent
		const rgba = decodePng(buildRgbaPng(1, 1, pixels));
		expect(rgba[0]).toBe(200);
		expect(rgba[1]).toBe(100);
		expect(rgba[2]).toBe(50);
		expect(rgba[3]).toBe(128);
	});
});

describe('decodePng - Grayscale (color type 0)', () => {
	it('expands gray to RGB with full opacity', () => {
		const pixels = new Uint8Array([180]);
		const rgba = decodePng(buildGrayscalePng(1, 1, pixels));
		expect(rgba[0]).toBe(180);
		expect(rgba[1]).toBe(180);
		expect(rgba[2]).toBe(180);
		expect(rgba[3]).toBe(255);
	});
});

describe('decodePng - Indexed (color type 3)', () => {
	it('maps palette indices to RGB', () => {
		const palette: Array<[number, number, number]> = [
			[10, 20, 30],
			[200, 150, 100],
		];
		const indices = new Uint8Array([0, 1, 1, 0]);
		const rgba = decodePng(buildIndexedPng(2, 2, indices, palette));
		expect([rgba[0], rgba[1], rgba[2]]).toEqual([10, 20, 30]);
		expect([rgba[4], rgba[5], rgba[6]]).toEqual([200, 150, 100]);
		expect([rgba[8], rgba[9], rgba[10]]).toEqual([200, 150, 100]);
		expect([rgba[12], rgba[13], rgba[14]]).toEqual([10, 20, 30]);
	});
});

describe('decodePng - PNG filters', () => {
	it('correctly applies Sub filter (type 1)', () => {
		// Build a scanline using Sub filter manually then verify round-trip
		const width = 4;
		const height = 1;
		// Original: [10, 20, 30,  20, 40, 60,  30, 60, 90,  40, 80, 120]
		// Sub-filtered: [10,20,30, 10,20,30, 10,20,30, 10,20,30]
		const stride = width * 3;
		const scanlines = new Uint8Array(1 + stride);
		scanlines[0] = 1; // Sub filter
		const subFiltered = [10, 20, 30, 10, 20, 30, 10, 20, 30, 10, 20, 30];
		for (let i = 0; i < subFiltered.length; i++) scanlines[1 + i] = subFiltered[i];

		const ihdr = ihdrChunk(width, height, 2);
		const idat = idatChunk(scanlines);
		const out = new Uint8Array(PNG_SIG.length + ihdr.length + idat.length + IEND.length);
		let o = 0;
		for (const p of [PNG_SIG, ihdr, idat, IEND]) {
			out.set(p, o);
			o += p.length;
		}
		const rgba = decodePng(out.buffer);

		expect([rgba[0], rgba[1], rgba[2]]).toEqual([10, 20, 30]);
		expect([rgba[4], rgba[5], rgba[6]]).toEqual([20, 40, 60]);
		expect([rgba[8], rgba[9], rgba[10]]).toEqual([30, 60, 90]);
		expect([rgba[12], rgba[13], rgba[14]]).toEqual([40, 80, 120]);
	});

	it('correctly applies Up filter (type 2)', () => {
		const width = 2;
		const height = 2;
		// Row 0: no-filter [10, 20, 30,  40, 50, 60]
		// Row 1: Up filter [5, 5, 5,  5, 5, 5] → [15, 25, 35,  45, 55, 65]
		const scanlines = new Uint8Array(2 * (1 + 6));
		scanlines[0] = 0; // None
		const row0 = [10, 20, 30, 40, 50, 60];
		for (let i = 0; i < 6; i++) scanlines[1 + i] = row0[i];
		scanlines[7] = 2; // Up
		const row1filt = [5, 5, 5, 5, 5, 5];
		for (let i = 0; i < 6; i++) scanlines[8 + i] = row1filt[i];

		const ihdr = ihdrChunk(width, height, 2);
		const idat = idatChunk(scanlines);
		const out = new Uint8Array(PNG_SIG.length + ihdr.length + idat.length + IEND.length);
		let o = 0;
		for (const p of [PNG_SIG, ihdr, idat, IEND]) {
			out.set(p, o);
			o += p.length;
		}
		const rgba = decodePng(out.buffer);

		expect([rgba[0], rgba[1], rgba[2]]).toEqual([10, 20, 30]);
		expect([rgba[8], rgba[9], rgba[10]]).toEqual([15, 25, 35]);
		expect([rgba[12], rgba[13], rgba[14]]).toEqual([45, 55, 65]);
	});
});

describe('decodePng - errors', () => {
	it('throws on invalid signature', () => {
		const bad = new Uint8Array(20).fill(0);
		expect(() => decodePng(bad.buffer)).toThrow('Not a PNG');
	});
});
