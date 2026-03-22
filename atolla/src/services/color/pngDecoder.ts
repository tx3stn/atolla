// Minimal PNG decoder supporting color types 0 (grayscale), 2 (RGB), 3 (indexed),
// 4 (grayscale+alpha), and 6 (RGBA). Returns a flat RGBA Uint8Array.

export function decodePng(buffer: ArrayBuffer): Uint8Array {
	const data = new Uint8Array(buffer);
	let pos = 0;

	const read32 = (): number =>
		((data[pos++] << 24) | (data[pos++] << 16) | (data[pos++] << 8) | data[pos++]) >>> 0;

	// Validate PNG signature
	const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
	for (let i = 0; i < 8; i++) {
		if (data[pos++] !== PNG_SIG[i]) throw new Error('Not a PNG');
	}

	let width = 0;
	let height = 0;
	let bitDepth = 0;
	let colorType = 0;
	const palette: Array<[number, number, number]> = [];
	const idatChunks: Array<Uint8Array> = [];

	while (pos < data.length) {
		const length = read32();
		const type = String.fromCharCode(data[pos], data[pos + 1], data[pos + 2], data[pos + 3]);
		pos += 4;
		const chunkData = data.slice(pos, pos + length);
		pos += length;
		pos += 4; // CRC (not verified)

		if (type === 'IHDR') {
			let p = 0;
			width =
				((chunkData[p++] << 24) |
					(chunkData[p++] << 16) |
					(chunkData[p++] << 8) |
					chunkData[p++]) >>>
				0;
			height =
				((chunkData[p++] << 24) |
					(chunkData[p++] << 16) |
					(chunkData[p++] << 8) |
					chunkData[p++]) >>>
				0;
			bitDepth = chunkData[p++];
			colorType = chunkData[p++];
			// compression, filter, interlace: ignored (only method 0 / filter 0 / no interlace supported)
		} else if (type === 'PLTE') {
			for (let i = 0; i < chunkData.length; i += 3) {
				palette.push([chunkData[i], chunkData[i + 1], chunkData[i + 2]]);
			}
		} else if (type === 'IDAT') {
			idatChunks.push(chunkData);
		} else if (type === 'IEND') {
			break;
		}
	}

	if (width === 0 || height === 0) throw new Error('Invalid PNG: missing or empty IHDR');

	// Concatenate all IDAT chunks and decompress
	let totalLen = 0;
	for (const c of idatChunks) totalLen += c.length;
	const compressed = new Uint8Array(totalLen);
	let offset = 0;
	for (const c of idatChunks) {
		compressed.set(c, offset);
		offset += c.length;
	}
	const raw = inflateZlib(compressed);

	// Reconstruct pixels from filtered scanlines
	const channels = colorTypeChannels(colorType);
	const bytesPerPixel = Math.max(1, Math.ceil((channels * bitDepth) / 8));
	const stride = Math.ceil((width * channels * bitDepth) / 8);

	const pixels = new Uint8Array(height * stride);
	let rawPos = 0;
	for (let row = 0; row < height; row++) {
		const filterByte = raw[rawPos++];
		const rowData = raw.subarray(rawPos, rawPos + stride);
		rawPos += stride;
		const prevRow =
			row > 0 ? pixels.subarray((row - 1) * stride, row * stride) : new Uint8Array(stride);
		const outRow = pixels.subarray(row * stride, (row + 1) * stride);
		applyFilter(filterByte, rowData, prevRow, outRow, bytesPerPixel);
	}

	// Convert to RGBA
	const rgba = new Uint8Array(width * height * 4);
	for (let row = 0; row < height; row++) {
		for (let col = 0; col < width; col++) {
			const pxIdx = (row * width + col) * 4;
			let r = 0,
				g = 0,
				b = 0,
				a = 255;

			if (bitDepth === 8) {
				const rowStart = row * stride;
				if (colorType === 0) {
					// Grayscale
					const v = pixels[rowStart + col];
					r = g = b = v;
				} else if (colorType === 2) {
					// RGB
					const base = rowStart + col * 3;
					r = pixels[base];
					g = pixels[base + 1];
					b = pixels[base + 2];
				} else if (colorType === 3) {
					// Indexed
					const idx = pixels[rowStart + col];
					const entry = palette[idx] ?? [0, 0, 0];
					r = entry[0];
					g = entry[1];
					b = entry[2];
				} else if (colorType === 4) {
					// Grayscale + alpha
					const base = rowStart + col * 2;
					r = g = b = pixels[base];
					a = pixels[base + 1];
				} else if (colorType === 6) {
					// RGBA
					const base = rowStart + col * 4;
					r = pixels[base];
					g = pixels[base + 1];
					b = pixels[base + 2];
					a = pixels[base + 3];
				}
			} else if (bitDepth === 16) {
				const rowStart = row * stride;
				if (colorType === 0) {
					r = g = b = pixels[rowStart + col * 2]; // high byte only
				} else if (colorType === 2) {
					const base = rowStart + col * 6;
					r = pixels[base];
					g = pixels[base + 2];
					b = pixels[base + 4];
				} else if (colorType === 6) {
					const base = rowStart + col * 8;
					r = pixels[base];
					g = pixels[base + 2];
					b = pixels[base + 4];
					a = pixels[base + 6];
				}
			} else if (bitDepth < 8 && colorType === 3) {
				// Sub-byte indexed
				const bitsPerPixel = bitDepth;
				const pixelsPerByte = 8 / bitsPerPixel;
				const byteIndex = Math.floor(col / pixelsPerByte);
				const bitOffset = (pixelsPerByte - 1 - (col % pixelsPerByte)) * bitsPerPixel;
				const mask = (1 << bitsPerPixel) - 1;
				const idx = (pixels[row * stride + byteIndex] >> bitOffset) & mask;
				const entry = palette[idx] ?? [0, 0, 0];
				r = entry[0];
				g = entry[1];
				b = entry[2];
			}

			rgba[pxIdx] = r;
			rgba[pxIdx + 1] = g;
			rgba[pxIdx + 2] = b;
			rgba[pxIdx + 3] = a;
		}
	}

	return rgba;
}

function colorTypeChannels(colorType: number): number {
	switch (colorType) {
		case 0:
			return 1; // grayscale
		case 2:
			return 3; // RGB
		case 3:
			return 1; // indexed (1 byte per pixel index)
		case 4:
			return 2; // grayscale + alpha
		case 6:
			return 4; // RGBA
		default:
			throw new Error(`Unsupported PNG color type: ${colorType}`);
	}
}

function applyFilter(
	filter: number,
	row: Uint8Array,
	prev: Uint8Array,
	out: Uint8Array,
	bpp: number,
): void {
	for (let i = 0; i < row.length; i++) {
		const x = row[i];
		const a = i >= bpp ? out[i - bpp] : 0;
		const b = prev[i];
		const c = i >= bpp ? prev[i - bpp] : 0;
		switch (filter) {
			case 0:
				out[i] = x;
				break;
			case 1:
				out[i] = (x + a) & 0xff;
				break;
			case 2:
				out[i] = (x + b) & 0xff;
				break;
			case 3:
				out[i] = (x + Math.floor((a + b) / 2)) & 0xff;
				break;
			case 4:
				out[i] = (x + paeth(a, b, c)) & 0xff;
				break;
			default:
				throw new Error(`Unknown PNG filter: ${filter}`);
		}
	}
}

function paeth(a: number, b: number, c: number): number {
	const p = a + b - c;
	const pa = Math.abs(p - a);
	const pb = Math.abs(p - b);
	const pc = Math.abs(p - c);
	if (pa <= pb && pa <= pc) return a;
	if (pb <= pc) return b;
	return c;
}

// ─── DEFLATE / zlib ──────────────────────────────────────────────────────────

function inflateZlib(data: Uint8Array): Uint8Array {
	// Skip 2-byte zlib header (CMF + FLG), ignore 4-byte Adler-32 trailer
	return inflate(data, 2, data.length - 4);
}

function inflate(src: Uint8Array, start: number, end: number): Uint8Array {
	const reader = new BitReader(src, start, end);
	const out: Array<number> = [];

	let bfinal = 0;
	do {
		bfinal = reader.readBits(1);
		const btype = reader.readBits(2);

		if (btype === 0) {
			// Stored block
			reader.alignToByte();
			const len = reader.readUint16LE();
			reader.readUint16LE(); // nlen (ignored)
			for (let i = 0; i < len; i++) out.push(reader.readByte());
		} else if (btype === 1) {
			inflateBlock(reader, out, FIXED_LITLEN, FIXED_DIST);
		} else if (btype === 2) {
			const hlit = reader.readBits(5) + 257;
			const hdist = reader.readBits(5) + 1;
			const hclen = reader.readBits(4) + 4;

			const clOrder = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
			const clLengths = new Uint8Array(19);
			for (let i = 0; i < hclen; i++) clLengths[clOrder[i]] = reader.readBits(3);
			const clTree = buildHuffmanTree(clLengths);

			const allLengths = readCodeLengths(reader, clTree, hlit + hdist);
			const litlenTree = buildHuffmanTree(allLengths.subarray(0, hlit));
			const distTree = buildHuffmanTree(allLengths.subarray(hlit));
			inflateBlock(reader, out, litlenTree, distTree);
		} else {
			throw new Error('Reserved DEFLATE block type');
		}
	} while (bfinal === 0);

	return new Uint8Array(out);
}

function inflateBlock(
	reader: BitReader,
	out: Array<number>,
	litlen: HuffmanTree,
	dist: HuffmanTree,
): void {
	for (;;) {
		const sym = decodeSymbol(reader, litlen);
		if (sym < 256) {
			out.push(sym);
		} else if (sym === 256) {
			break;
		} else {
			const lengthCode = sym - 257;
			const length = LENGTH_BASE[lengthCode] + reader.readBits(LENGTH_EXTRA[lengthCode]);
			const distSym = decodeSymbol(reader, dist);
			const distance = DIST_BASE[distSym] + reader.readBits(DIST_EXTRA[distSym]);
			const start = out.length - distance;
			for (let i = 0; i < length; i++) out.push(out[start + i]);
		}
	}
}

// ─── Huffman tree ─────────────────────────────────────────────────────────────

// HuffmanTree is a flat Int16Array used as a binary tree.
// tree[0] and tree[1] are the root's children for bit 0 and bit 1.
// Positive values are symbol values + 1; negative values are node indices * -2.
// 0 means unused.
type HuffmanTree = Int16Array;

function buildHuffmanTree(lengths: Uint8Array): HuffmanTree {
	const maxLen = Math.max(...lengths);
	const blCount = new Uint16Array(maxLen + 1);
	for (const l of lengths) if (l > 0) blCount[l]++;

	const nextCode = new Uint16Array(maxLen + 1);
	let code = 0;
	for (let bits = 1; bits <= maxLen; bits++) {
		code = (code + blCount[bits - 1]) << 1;
		nextCode[bits] = code;
	}

	// Build tree as flat array: nodes[i*2] = left child, nodes[i*2+1] = right child
	// child > 0 means literal symbol + 1; child < 0 means node index -(child+1)
	// child = 0 means empty
	const nodes: Array<number> = [0, 0]; // root node at index 0
	let nextNode = 1;

	for (let sym = 0; sym < lengths.length; sym++) {
		const len = lengths[sym];
		if (len === 0) continue;
		const c = nextCode[len]++;
		let node = 0;
		for (let bit = len - 1; bit > 0; bit--) {
			const dir = (c >> bit) & 1;
			let child = nodes[node * 2 + dir];
			if (child === 0) {
				nodes.push(0, 0);
				child = -nextNode++;
				nodes[node * 2 + dir] = child;
			}
			node = -child - 1;
		}
		nodes[node * 2 + (c & 1)] = sym + 1; // positive = symbol+1
	}

	return new Int16Array(nodes);
}

function decodeSymbol(reader: BitReader, tree: HuffmanTree): number {
	let node = 0;
	for (;;) {
		const bit = reader.readBits(1);
		const child = tree[node * 2 + bit];
		if (child > 0) return child - 1;
		if (child === 0) throw new Error('Invalid Huffman code');
		node = -child - 1;
	}
}

function readCodeLengths(reader: BitReader, clTree: HuffmanTree, count: number): Uint8Array {
	const lengths = new Uint8Array(count);
	let i = 0;
	while (i < count) {
		const sym = decodeSymbol(reader, clTree);
		if (sym < 16) {
			lengths[i++] = sym;
		} else if (sym === 16) {
			const repeat = reader.readBits(2) + 3;
			for (let j = 0; j < repeat; j++) lengths[i++] = lengths[i - 1];
		} else if (sym === 17) {
			const repeat = reader.readBits(3) + 3;
			i += repeat;
		} else {
			const repeat = reader.readBits(7) + 11;
			i += repeat;
		}
	}
	return lengths;
}

// ─── Bit reader ───────────────────────────────────────────────────────────────

class BitReader {
	private buf: Uint8Array;
	private bytePos: number;
	private end: number;
	private bitBuf = 0;
	private bitCount = 0;

	constructor(buf: Uint8Array, start: number, end: number) {
		this.buf = buf;
		this.bytePos = start;
		this.end = end;
	}

	readBits(n: number): number {
		while (this.bitCount < n) {
			if (this.bytePos >= this.end) throw new Error('Unexpected end of deflate stream');
			this.bitBuf |= this.buf[this.bytePos++] << this.bitCount;
			this.bitCount += 8;
		}
		const val = this.bitBuf & ((1 << n) - 1);
		this.bitBuf >>>= n;
		this.bitCount -= n;
		return val;
	}

	readByte(): number {
		return this.readBits(8);
	}

	readUint16LE(): number {
		return this.readBits(8) | (this.readBits(8) << 8);
	}

	alignToByte(): void {
		this.bitBuf = 0;
		this.bitCount = 0;
	}
}

// ─── DEFLATE lookup tables ────────────────────────────────────────────────────

// Length codes 257-285: base lengths and extra bits
const LENGTH_BASE = [
	3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
	163, 195, 227, 258,
];
const LENGTH_EXTRA = [
	0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];

// Distance codes 0-29: base distances and extra bits
const DIST_BASE = [
	1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
	3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DIST_EXTRA = [
	0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];

// Fixed Huffman trees per RFC 1951 §3.2.6
const FIXED_LITLEN = (() => {
	const lengths = new Uint8Array(288);
	for (let i = 0; i <= 143; i++) lengths[i] = 8;
	for (let i = 144; i <= 255; i++) lengths[i] = 9;
	for (let i = 256; i <= 279; i++) lengths[i] = 7;
	for (let i = 280; i <= 287; i++) lengths[i] = 8;
	return buildHuffmanTree(lengths);
})();

const FIXED_DIST = (() => {
	const lengths = new Uint8Array(30);
	lengths.fill(5);
	return buildHuffmanTree(lengths);
})();
