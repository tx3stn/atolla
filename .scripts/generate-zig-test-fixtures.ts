// regenerates the encoder-produced image fixtures embedded by the palette/blur zig tests.
// these are committed bytes, so tests stay stable regardless of the libvips version used here.
// run with: bun ./.scripts/generate-zig-test-fixtures.ts
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const OUT = resolve(process.cwd(), 'atolla/native/zig/testdata');
mkdirSync(OUT, { recursive: true });

const W = 16;
const H = 16;

// dominant-blue PNG: a vertical blue gradient forces per-row differences, so libpng picks
// non-None row filters and zlib emits Huffman (not stored) blocks — exercising the full inflate
// + filter-reconstruction path, unlike the stored-block buildTestPng helper.
{
	const rgb = new Uint8Array(W * H * 3);
	for (let y = 0; y < H; y++) {
		const b = Math.round(120 + (y / (H - 1)) * 120);
		for (let x = 0; x < W; x++) {
			const i = (y * W + x) * 3;
			rgb[i + 0] = 0;
			rgb[i + 1] = 0;
			rgb[i + 2] = b;
		}
	}
	await sharp(rgb, { raw: { channels: 3, height: H, width: W } })
		.png({ adaptiveFiltering: true, compressionLevel: 9, palette: false })
		.toFile(resolve(OUT, 'dominant_blue.png'));
}

// baseline (non-progressive) JPEG, solid saturated red: the DC-only decoder recovers each 8x8
// block's average, so a solid colour round-trips cleanly. 4:4:4 keeps every component at 1x1
// sampling to keep the fixture simple.
{
	const rgb = new Uint8Array(W * H * 3);
	for (let i = 0; i < W * H; i++) {
		rgb[i * 3 + 0] = 200;
		rgb[i * 3 + 1] = 30;
		rgb[i * 3 + 2] = 30;
	}
	await sharp(rgb, { raw: { channels: 3, height: H, width: W } })
		.jpeg({ chromaSubsampling: '4:4:4', progressive: false, quality: 92 })
		.toFile(resolve(OUT, 'dominant_red_baseline.jpg'));
}

// RGBA (color_type 6): a transparent red field with a central opaque green block. only the
// opaque green pixels should reach the histogram, so a fully-transparent colour never wins.
{
	const rgba = new Uint8Array(W * H * 4);
	for (let i = 0; i < W * H; i++) {
		rgba[i * 4 + 0] = 200; // transparent red — must be ignored
		rgba[i * 4 + 1] = 0;
		rgba[i * 4 + 2] = 0;
		rgba[i * 4 + 3] = 0;
	}
	for (let y = 4; y < 12; y++) {
		for (let x = 4; x < 12; x++) {
			const i = (y * W + x) * 4;
			rgba[i + 0] = 30;
			rgba[i + 1] = 170;
			rgba[i + 2] = 70;
			rgba[i + 3] = 255;
		}
	}
	await sharp(rgba, { raw: { channels: 4, height: H, width: W } })
		.png({ adaptiveFiltering: true, compressionLevel: 9, palette: false })
		.toFile(resolve(OUT, 'transparent_green.png'));
}

console.log(`wrote fixtures to ${OUT}`);
