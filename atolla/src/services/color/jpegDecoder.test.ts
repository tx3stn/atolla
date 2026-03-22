import { describe, expect, it } from 'bun:test';
import { decodeJpeg } from './jpegDecoder';

// ─── Minimal JPEG builder ─────────────────────────────────────────────────────
// Builds a tiny but valid baseline JPEG (1 MCU = 8×8, single colour).
// The Huffman and quantization tables are the standard JFIF defaults so any
// standard decoder would also accept these files.

function u16BE(n: number): Array<number> {
	return [(n >> 8) & 0xff, n & 0xff];
}

// Standard luminance quantization table (JFIF quality 50)
const LUM_QUANT = [
	16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56,
	14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113,
	92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
];

// Standard chrominance quantization table
const CHR_QUANT = [
	17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99,
	47, 66, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
	99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
];

// Standard DC Huffman table (luminance) — JFIF Annex K
const DC_LUM_COUNTS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const DC_LUM_SYMS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

// Standard DC Huffman table (chrominance)
const DC_CHR_COUNTS = [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0];
const DC_CHR_SYMS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

// Standard AC Huffman table (luminance) — abbreviated
const AC_LUM_COUNTS = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 125];
const AC_LUM_SYMS = [
	0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
	0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0,
	0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
	0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
	0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
	0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
	0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
	0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
	0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
	0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
	0xf9, 0xfa,
];

// Standard AC Huffman table (chrominance)
const AC_CHR_COUNTS = [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 119];
const AC_CHR_SYMS = [
	0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71,
	0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0,
	0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26,
	0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48,
	0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68,
	0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
	0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5,
	0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3,
	0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
	0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
	0xf9, 0xfa,
];

function dqtSegment(tableId: number, quant: Array<number>): Array<number> {
	const data = [tableId, ...quant];
	return [0xff, 0xdb, ...u16BE(data.length + 2), ...data];
}

function dhtSegment(tcId: number, counts: Array<number>, syms: Array<number>): Array<number> {
	const data = [tcId, ...counts, ...syms];
	return [0xff, 0xc4, ...u16BE(data.length + 2), ...data];
}

// Build a canonical Huffman code table to encode a single symbol
function buildEncoder(
	counts: Array<number>,
	syms: Array<number>,
): Map<number, { code: number; len: number }> {
	const map = new Map<number, { code: number; len: number }>();
	let code = 0;
	let symIdx = 0;
	for (let len = 1; len <= 16; len++) {
		const n = counts[len - 1];
		for (let i = 0; i < n; i++) {
			map.set(syms[symIdx++], { code, len });
			code++;
		}
		code <<= 1;
	}
	return map;
}

// Write bits MSB-first into a byte array, with JPEG byte-stuffing
class JpegBitWriter {
	private bits: Array<number> = [];

	writeBits(code: number, len: number): void {
		for (let i = len - 1; i >= 0; i--) {
			this.bits.push((code >> i) & 1);
		}
	}

	toBytes(): Array<number> {
		const out: Array<number> = [];
		let byte = 0;
		let count = 0;
		for (const bit of this.bits) {
			byte = (byte << 1) | bit;
			count++;
			if (count === 8) {
				out.push(byte);
				if (byte === 0xff) out.push(0x00); // byte stuffing
				byte = 0;
				count = 0;
			}
		}
		if (count > 0) {
			byte <<= 8 - count;
			out.push(byte);
			if (byte === 0xff) out.push(0x00);
		}
		return out;
	}
}

// Encode a DC coefficient value as category + magnitude bits
function encodeDC(
	writer: JpegBitWriter,
	encoder: Map<number, { code: number; len: number }>,
	diff: number,
): void {
	const absDiff = Math.abs(diff);
	let cat = 0;
	let temp = absDiff;
	while (temp > 0) {
		cat++;
		temp >>= 1;
	}
	const entry = encoder.get(cat);
	if (!entry) throw new Error(`No DC encoder entry for category ${cat}`);
	writer.writeBits(entry.code, entry.len);
	if (cat > 0) {
		// Magnitude bits: positive = value, negative = value + (2^cat - 1)
		writer.writeBits(diff > 0 ? diff : diff + (1 << cat) - 1, cat);
	}
}

// Encode EOB for AC
function encodeEOB(
	writer: JpegBitWriter,
	encoder: Map<number, { code: number; len: number }>,
): void {
	const entry = encoder.get(0x00);
	if (!entry) throw new Error('No AC encoder entry for EOB (0x00)');
	writer.writeBits(entry.code, entry.len);
}

/**
 * Build an 8×8 YCbCr JPEG where each MCU has fixed DC coefficients
 * derived from the desired average RGB colour.
 *
 * The image is 8×8 pixels, YCbCr 4:4:4 (H=1,V=1 for all components),
 * which means one MCU with 3 blocks (Y, Cb, Cr).
 */
function buildSingleColorJpeg(r: number, g: number, b: number): ArrayBuffer {
	// Convert RGB to YCbCr
	const Y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
	const Cb = Math.round(-0.168736 * r - 0.331264 * g + 0.5 * b + 128);
	const Cr = Math.round(0.5 * r - 0.418688 * g - 0.081312 * b + 128);

	// DC coefficients: (value - 128) * 8 / quant[0]
	// We want the decoder to recover value ≈ Y/Cb/Cr
	const dcY = Math.round(((Y - 128) * 8) / LUM_QUANT[0]);
	const dcCb = Math.round(((Cb - 128) * 8) / CHR_QUANT[0]);
	const dcCr = Math.round(((Cr - 128) * 8) / CHR_QUANT[0]);

	const dcLumEnc = buildEncoder(DC_LUM_COUNTS, DC_LUM_SYMS);
	const dcChrEnc = buildEncoder(DC_CHR_COUNTS, DC_CHR_SYMS);
	const acLumEnc = buildEncoder(AC_LUM_COUNTS, AC_LUM_SYMS);
	const acChrEnc = buildEncoder(AC_CHR_COUNTS, AC_CHR_SYMS);

	const writer = new JpegBitWriter();
	// Y block: DC then EOB
	encodeDC(writer, dcLumEnc, dcY);
	encodeEOB(writer, acLumEnc);
	// Cb block: DC then EOB
	encodeDC(writer, dcChrEnc, dcCb);
	encodeEOB(writer, acChrEnc);
	// Cr block: DC then EOB
	encodeDC(writer, dcChrEnc, dcCr);
	encodeEOB(writer, acChrEnc);

	const scanData = writer.toBytes();

	const bytes: Array<number> = [
		0xff,
		0xd8, // SOI
		// APP0 (minimal JFIF)
		0xff,
		0xe0,
		0x00,
		0x10,
		0x4a,
		0x46,
		0x49,
		0x46,
		0x00, // "JFIF\0"
		0x01,
		0x01, // version
		0x00, // pixel aspect
		0x00,
		0x01,
		0x00,
		0x01, // 1:1 aspect
		0x00,
		0x00, // no thumbnail
		// DQT luminance (table 0)
		...dqtSegment(0, LUM_QUANT),
		// DQT chrominance (table 1)
		...dqtSegment(1, CHR_QUANT),
		// SOF0: 8×8, 3 components, YCbCr 4:4:4
		0xff,
		0xc0,
		0x00,
		0x11, // marker + length 17
		0x08, // 8-bit precision
		0x00,
		0x08, // height 8
		0x00,
		0x08, // width 8
		0x03, // 3 components
		0x01,
		0x11,
		0x00, // Y:  H=1,V=1, quant=0
		0x02,
		0x11,
		0x01, // Cb: H=1,V=1, quant=1
		0x03,
		0x11,
		0x01, // Cr: H=1,V=1, quant=1
		// DHT DC luminance (table 0, DC)
		...dhtSegment(0x00, DC_LUM_COUNTS, DC_LUM_SYMS),
		// DHT AC luminance (table 0, AC)
		...dhtSegment(0x10, AC_LUM_COUNTS, AC_LUM_SYMS),
		// DHT DC chrominance (table 1, DC)
		...dhtSegment(0x01, DC_CHR_COUNTS, DC_CHR_SYMS),
		// DHT AC chrominance (table 1, AC)
		...dhtSegment(0x11, AC_CHR_COUNTS, AC_CHR_SYMS),
		// SOS
		0xff,
		0xda,
		0x00,
		0x0c, // marker + length 12
		0x03, // 3 components in scan
		0x01,
		0x00, // Y: DC=0, AC=0
		0x02,
		0x11, // Cb: DC=1, AC=1
		0x03,
		0x11, // Cr: DC=1, AC=1
		0x00,
		0x3f,
		0x00, // Ss=0, Se=63, Ah=0, Al=0
		// Entropy-coded scan data
		...scanData,
		0xff,
		0xd9, // EOI
	];

	return new Uint8Array(bytes).buffer;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('decodeJpeg', () => {
	it('throws on non-JPEG data', () => {
		expect(() => decodeJpeg(new Uint8Array(20).buffer)).toThrow('Not a JPEG');
	});

	it('returns RGBA samples for a single-MCU image', () => {
		const jpeg = buildSingleColorJpeg(200, 100, 50);
		const rgba = decodeJpeg(jpeg);
		expect(rgba.length).toBe(4); // 1 MCU = 4 bytes
		expect(rgba[3]).toBe(255); // alpha always 255
	});

	it('approximates a red-dominant colour', () => {
		// Pure red in YCbCr will produce an output with R >> G, B
		const jpeg = buildSingleColorJpeg(200, 30, 30);
		const rgba = decodeJpeg(jpeg);
		const [r, g, b] = [rgba[0], rgba[1], rgba[2]];
		expect(r).toBeGreaterThan(g + 50);
		expect(r).toBeGreaterThan(b + 50);
	});

	it('approximates a blue-dominant colour', () => {
		const jpeg = buildSingleColorJpeg(30, 30, 200);
		const rgba = decodeJpeg(jpeg);
		const [r, g, b] = [rgba[0], rgba[1], rgba[2]];
		expect(b).toBeGreaterThan(r + 50);
		expect(b).toBeGreaterThan(g + 50);
	});

	it('approximates a near-white colour as high brightness', () => {
		const jpeg = buildSingleColorJpeg(220, 220, 220);
		const rgba = decodeJpeg(jpeg);
		expect(rgba[0]).toBeGreaterThan(150);
		expect(rgba[1]).toBeGreaterThan(150);
		expect(rgba[2]).toBeGreaterThan(150);
	});

	it('approximates a near-black colour as low brightness', () => {
		const jpeg = buildSingleColorJpeg(20, 20, 20);
		const rgba = decodeJpeg(jpeg);
		expect(rgba[0]).toBeLessThan(80);
		expect(rgba[1]).toBeLessThan(80);
		expect(rgba[2]).toBeLessThan(80);
	});
});
