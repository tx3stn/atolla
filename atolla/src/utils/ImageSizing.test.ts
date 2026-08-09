import { describe, expect, it } from 'bun:test';
import { deriveAlbumArtMaxDimension } from './ImageSizing';

describe('deriveAlbumArtMaxDimension on phones', () => {
	// a phone shows album art at the full window width, and the common ones land inside the smallest
	// size, so they fetch exactly what they do today
	it('holds at the smallest size', () => {
		expect(deriveAlbumArtMaxDimension(375, 2)).toBe(1280);
		expect(deriveAlbumArtMaxDimension(393, 3)).toBe(1280);
		expect(deriveAlbumArtMaxDimension(402, 3)).toBe(1280);
	});

	// the widest phone at 3x genuinely needs 1320px, so it takes the next size up rather than upscaling
	it('steps up when the display actually needs it', () => {
		expect(deriveAlbumArtMaxDimension(440, 3)).toBe(1600);
	});
});

describe('deriveAlbumArtMaxDimension on tablets', () => {
	// the expanded player artwork, which is what drove this: 711pt at 2x needs 1422px
	it('covers the expanded player artwork', () => {
		expect(deriveAlbumArtMaxDimension(711, 2)).toBe(1600);
	});

	it('steps up again for a larger tablet', () => {
		expect(deriveAlbumArtMaxDimension(900, 2)).toBe(2048);
	});
});

describe('deriveAlbumArtMaxDimension bounds', () => {
	it('never asks for more than the largest size', () => {
		expect(deriveAlbumArtMaxDimension(4000, 3)).toBe(2048);
	});

	// the size is resolved once at startup, so a bad device read must not poison every image url
	it('falls back to the smallest size on an unusable reading', () => {
		expect(deriveAlbumArtMaxDimension(0, 2)).toBe(1280);
		expect(deriveAlbumArtMaxDimension(834, 0)).toBe(1280);
		expect(deriveAlbumArtMaxDimension(Number.NaN, 2)).toBe(1280);
		expect(deriveAlbumArtMaxDimension(834, Number.NaN)).toBe(1280);
		expect(deriveAlbumArtMaxDimension(-100, 2)).toBe(1280);
	});
});
