import { describe, expect, it } from 'bun:test';
import { parseJpegColor } from './jpegColorParser';

// ---------------------------------------------------------------------------
// Minimal JPEG builder for tests
//
// Uses a simple Huffman scheme so the bitstream is easy to reason about:
//   DC table (shared): all 12 categories (0–11) assigned 4-bit codes 0000–1011
//   AC table (shared): only EOB (0x00) with 1-bit code 0
//
// With an all-ones quantization table (quant[0] = 1), the DC coefficient for
// a component equals (pixelLevel − 128), and dequantizing gives pixelLevel back.
// ---------------------------------------------------------------------------

// DC: 12 symbols (categories 0–11) all of length 4
const DC_CODE_LENGTHS = [0, 0, 0, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const DC_SYMBOLS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
// DC codes: category N → 4-bit code N (0b0000 … 0b1011)

// AC: EOB only, length 1, code 0
const AC_CODE_LENGTHS = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const AC_SYMBOLS = [0x00];

function u16(n: number): Array<number> {
	return [(n >> 8) & 0xff, n & 0xff];
}

function buildDhtSegment(
	tableClass: 0 | 1,
	tableId: number,
	lengths: Array<number>,
	symbols: Array<number>,
): Array<number> {
	const body = [tableClass === 0 ? tableId : 0x10 | tableId, ...lengths, ...symbols];
	return [0xff, 0xc4, ...u16(2 + body.length), ...body];
}

function buildDqtSegment(tableId: number, values: Array<number>): Array<number> {
	// precision=0 (8-bit), tableId in low nibble
	const body = [tableId & 0xf, ...values];
	return [0xff, 0xdb, ...u16(2 + body.length), ...body];
}

function buildSof0Segment(
	width: number,
	height: number,
	components: Array<{ id: number; hSamp: number; vSamp: number; qtId: number }>,
): Array<number> {
	const compBytes = components.flatMap((c) => [c.id, (c.hSamp << 4) | c.vSamp, c.qtId]);
	const body = [8, ...u16(height), ...u16(width), components.length, ...compBytes];
	return [0xff, 0xc0, ...u16(2 + body.length), ...body];
}

function buildSosHeader(
	components: Array<{ id: number; dcId: number; acId: number }>,
): Array<number> {
	const compBytes = components.flatMap((c) => [c.id, (c.dcId << 4) | c.acId]);
	const body = [components.length, ...compBytes, 0, 63, 0]; // Ss=0, Se=63, Ah/Al=0
	return [0xff, 0xda, ...u16(2 + body.length), ...body];
}

/**
 * Encode the DC coefficient for one component block followed by AC EOB.
 * Returns the bits as an array of 0/1 values (MSB first).
 */
function encodeBlock(dcCoeff: number): Array<number> {
	const bits: Array<number> = [];

	// DC: 4-bit Huffman code = category, then category value bits
	if (dcCoeff === 0) {
		// category 0, code = 0b0000
		bits.push(0, 0, 0, 0);
	} else {
		const abs = Math.abs(dcCoeff);
		// category = number of bits needed to represent abs
		let cat = 0;
		let tmp = abs;
		while (tmp > 0) {
			cat++;
			tmp >>= 1;
		}

		// 4-bit Huffman code = cat
		bits.push((cat >> 3) & 1, (cat >> 2) & 1, (cat >> 1) & 1, cat & 1);

		// value bits: positive → binary value; negative → biased form per JPEG spec
		const encoded = dcCoeff > 0 ? abs : (1 << cat) - 1 + dcCoeff;
		for (let i = cat - 1; i >= 0; i--) bits.push((encoded >> i) & 1);
	}

	// AC EOB: 1-bit code = 0
	bits.push(0);

	return bits;
}

/**
 * Pack an array of bits (MSB first) into bytes, padding the last byte with zeros.
 */
function packBits(bits: Array<number>): Array<number> {
	const bytes: Array<number> = [];
	for (let i = 0; i < bits.length; i += 8) {
		let byte = 0;
		for (let j = 0; j < 8; j++) byte = (byte << 1) | (bits[i + j] ?? 0);
		bytes.push(byte);
	}
	return bytes;
}

/**
 * Build a minimal but valid baseline JPEG for a single-color 8×8 image.
 * Y, Cb, Cr are the full 0–255 pixel levels for each channel.
 * All three components share quantization table 0 (all ones) and Huffman table 0.
 */
function buildJpeg(Y: number, Cb: number, Cr: number): Uint8Array {
	const flatQt = Array(64).fill(1);

	const sofComponents = [
		{ hSamp: 1, id: 1, qtId: 0, vSamp: 1 }, // Y
		{ hSamp: 1, id: 2, qtId: 0, vSamp: 1 }, // Cb
		{ hSamp: 1, id: 3, qtId: 0, vSamp: 1 }, // Cr
	];
	const sosComponents = [
		{ acId: 0, dcId: 0, id: 1 },
		{ acId: 0, dcId: 0, id: 2 },
		{ acId: 0, dcId: 0, id: 3 },
	];

	// DC coefficients: pixel - 128 (with quant[0]=1)
	const yDc = Y - 128;
	const cbDc = Cb - 128;
	const crDc = Cr - 128;

	const scanBits = [...encodeBlock(yDc), ...encodeBlock(cbDc), ...encodeBlock(crDc)];
	const scanData = packBits(scanBits);

	const bytes: Array<number> = [
		0xff,
		0xd8, // SOI
		...buildDqtSegment(0, flatQt),
		...buildSof0Segment(8, 8, sofComponents),
		...buildDhtSegment(0, 0, DC_CODE_LENGTHS, DC_SYMBOLS), // DC table 0
		...buildDhtSegment(1, 0, AC_CODE_LENGTHS, AC_SYMBOLS), // AC table 0
		...buildSosHeader(sosComponents),
		...scanData,
		0xff,
		0xd9, // EOI
	];

	return new Uint8Array(bytes);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseJpegColor', () => {
	it('returns null for empty data', () => {
		expect(parseJpegColor(new Uint8Array([]))).toBeNull();
	});

	it('returns null for non-JPEG data (wrong magic bytes)', () => {
		expect(parseJpegColor(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull(); // PNG header
	});

	it('returns null for truncated JPEG (SOI only)', () => {
		expect(parseJpegColor(new Uint8Array([0xff, 0xd8]))).toBeNull();
	});

	it('returns null for JPEG missing required segments', () => {
		// SOI + EOI but no SOF/DHT/DQT/SOS
		expect(parseJpegColor(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
	});

	it('extracts neutral grey (Y=128, Cb=128, Cr=128)', () => {
		// All DC coefficients are 0 → Y=Cb=Cr=128 → R=G=B=128
		const jpeg = buildJpeg(128, 128, 128);
		expect(parseJpegColor(jpeg)).toBe('#808080');
	});

	it('extracts pure white (Y=255, Cb=128, Cr=128)', () => {
		// No chroma shift: R=G=B=255
		const jpeg = buildJpeg(255, 128, 128);
		expect(parseJpegColor(jpeg)).toBe('#ffffff');
	});

	it('extracts pure black (Y=0, Cb=128, Cr=128)', () => {
		const jpeg = buildJpeg(0, 128, 128);
		expect(parseJpegColor(jpeg)).toBe('#000000');
	});

	it('extracts a warm reddish color', () => {
		// Y=200, Cb=120, Cr=180
		// R = clamp(200 + 1.402*(180-128)) = clamp(272.9) = 255
		// G = clamp(200 - 0.344136*(-8) - 0.714136*52) = clamp(165.6) = 166
		// B = clamp(200 + 1.772*(-8)) = clamp(185.8) = 186
		const jpeg = buildJpeg(200, 120, 180);
		expect(parseJpegColor(jpeg)).toBe('#ffa6ba');
	});

	it('extracts a cool bluish color', () => {
		// Y=100, Cb=200, Cr=100
		// R = clamp(100 + 1.402*(-28)) = clamp(60.7) = 61
		// G = clamp(100 - 0.344136*72 - 0.714136*(-28)) = clamp(95.2) = 95
		// B = clamp(100 + 1.772*72) = clamp(227.6) = 228
		const jpeg = buildJpeg(100, 200, 100);
		expect(parseJpegColor(jpeg)).toBe('#3d5fe4');
	});

	it('respects quantization table — quant[0]=2 halves the DC coefficient', () => {
		// Build a JPEG where quant[0]=2 instead of 1.
		// Y=200, Cb=128, Cr=128 → DC coeff for Y = (200-128)/2 = 36
		// After dequantize: 36*2+128 = 200 → same result as without quant scaling
		// But if we misparse quant, the value would differ.
		const flatQt2 = Array(64).fill(1);
		flatQt2[0] = 2;

		const sofComponents = [
			{ hSamp: 1, id: 1, qtId: 0, vSamp: 1 },
			{ hSamp: 1, id: 2, qtId: 0, vSamp: 1 },
			{ hSamp: 1, id: 3, qtId: 0, vSamp: 1 },
		];
		const sosComponents = [
			{ acId: 0, dcId: 0, id: 1 },
			{ acId: 0, dcId: 0, id: 2 },
			{ acId: 0, dcId: 0, id: 3 },
		];

		// DC coefficients are stored after division by quant[0]:
		// Y pixel=200 → DC coeff stored = (200-128)/quant[0] = 72/2 = 36
		// (We encode 36, parser multiplies by quant[0]=2 to get 72, then +128 → 200)
		const scanBits = [
			...encodeBlock(36), // Y DC = 36 (pixel will be 36*2+128=200)
			...encodeBlock(0), // Cb DC = 0 (pixel=128)
			...encodeBlock(0), // Cr DC = 0 (pixel=128)
		];
		const scanData = packBits(scanBits);

		const bytes: Array<number> = [
			0xff,
			0xd8,
			...buildDqtSegment(0, flatQt2),
			...buildSof0Segment(8, 8, sofComponents),
			...buildDhtSegment(0, 0, DC_CODE_LENGTHS, DC_SYMBOLS),
			...buildDhtSegment(1, 0, AC_CODE_LENGTHS, AC_SYMBOLS),
			...buildSosHeader(sosComponents),
			...scanData,
			0xff,
			0xd9,
		];
		const jpeg = new Uint8Array(bytes);

		// Y=200, Cb=128, Cr=128 → pure luminance, no chroma
		// R = G = B = clamp(200 + 0) = 200 = 0xc8
		expect(parseJpegColor(jpeg)).toBe('#c8c8c8');
	});

	it('handles 4:2:0 chroma subsampling (Y has hSamp=2, vSamp=2)', () => {
		// Y component has 4 blocks per MCU (2x2), Cb and Cr have 1 each.
		// Parser should read first block of Y, skip remaining 3, then Cb, Cr.
		const flatQt = Array(64).fill(1);

		const sofComponents = [
			{ hSamp: 2, id: 1, qtId: 0, vSamp: 2 }, // Y: 4 blocks per MCU
			{ hSamp: 1, id: 2, qtId: 0, vSamp: 1 },
			{ hSamp: 1, id: 3, qtId: 0, vSamp: 1 },
		];
		const sosComponents = [
			{ acId: 0, dcId: 0, id: 1 },
			{ acId: 0, dcId: 0, id: 2 },
			{ acId: 0, dcId: 0, id: 3 },
		];

		// Y=150, Cb=100, Cr=150
		const scanBits = [
			...encodeBlock(150 - 128), // Y block 0 (used)
			...encodeBlock(5), // Y block 1 (skipped)
			...encodeBlock(-10), // Y block 2 (skipped)
			...encodeBlock(3), // Y block 3 (skipped)
			...encodeBlock(100 - 128), // Cb
			...encodeBlock(150 - 128), // Cr
		];
		const scanData = packBits(scanBits);

		const bytes: Array<number> = [
			0xff,
			0xd8,
			...buildDqtSegment(0, flatQt),
			...buildSof0Segment(16, 16, sofComponents),
			...buildDhtSegment(0, 0, DC_CODE_LENGTHS, DC_SYMBOLS),
			...buildDhtSegment(1, 0, AC_CODE_LENGTHS, AC_SYMBOLS),
			...buildSosHeader(sosComponents),
			...scanData,
			0xff,
			0xd9,
		];
		const jpeg = new Uint8Array(bytes);

		// Y=150, Cb=100, Cr=150
		// R = clamp(150 + 1.402*(150-128)) = clamp(150 + 30.844) = clamp(180.844) = 181
		// G = clamp(150 - 0.344136*(100-128) - 0.714136*(150-128))
		//   = clamp(150 + 9.636 - 15.711) = clamp(143.925) = 144
		// B = clamp(150 + 1.772*(100-128)) = clamp(150 - 49.616) = clamp(100.384) = 100
		expect(parseJpegColor(jpeg)).toBe('#b59064');
	});

	it('handles byte stuffing in scan data (0xFF 0x00 → 0xFF)', () => {
		// Craft scan data that contains 0xFF followed by 0x00.
		// The parser should treat 0xFF 0x00 as a literal 0xFF data byte.
		// We'll use DC coeff = 127 for Y (max positive in cat 7) which may produce
		// 0xFF in scan data depending on packing. Instead, we explicitly inject
		// 0xFF 0x00 stuffing into the packed bytes and verify the parser doesn't crash.

		// Use a simpler verification: build a valid JPEG and manually insert 0xFF 0x00
		// in the scan area, then verify it still parses. We pick Y=128 (DC=0) so
		// the result is predictable as long as the stuffed byte is in padding.
		const jpeg = buildJpeg(128, 128, 128);
		const bytes = Array.from(jpeg);

		// The scan data starts after SOS header. Find EOI (FF D9) at the end.
		// Insert FF 00 before EOI to test stuffing handling.
		const eoiIdx = bytes.length - 2;
		bytes.splice(eoiIdx, 0, 0xff, 0x00);

		// Still should parse cleanly since the stuffed byte is padding after the MCU
		const result = parseJpegColor(new Uint8Array(bytes));
		expect(result).toBe('#808080');
	});

	it('returns null when Huffman tables are missing', () => {
		// Build a JPEG with SOF and SOS but no DHT segments
		const flatQt = Array(64).fill(1);
		const sofComponents = [
			{ hSamp: 1, id: 1, qtId: 0, vSamp: 1 },
			{ hSamp: 1, id: 2, qtId: 0, vSamp: 1 },
			{ hSamp: 1, id: 3, qtId: 0, vSamp: 1 },
		];
		const sosComponents = [
			{ acId: 0, dcId: 0, id: 1 },
			{ acId: 0, dcId: 0, id: 2 },
			{ acId: 0, dcId: 0, id: 3 },
		];

		const bytes: Array<number> = [
			0xff,
			0xd8,
			...buildDqtSegment(0, flatQt),
			...buildSof0Segment(8, 8, sofComponents),
			// No DHT segments
			...buildSosHeader(sosComponents),
			0x00, // minimal scan data
			0xff,
			0xd9,
		];
		expect(parseJpegColor(new Uint8Array(bytes))).toBeNull();
	});
});
