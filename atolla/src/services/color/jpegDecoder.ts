// Minimal baseline JPEG decoder for color extraction.
// Decodes DC coefficients only (one sample per 8×8 MCU block), which gives the
// average colour of each block — sufficient for dominant-colour extraction.
// Returns a flat RGBA Uint8Array (one 4-byte entry per MCU).

export function decodeJpeg(buffer: ArrayBuffer): Uint8Array {
	const data = new Uint8Array(buffer);
	const ctx = parseMarkers(data);
	return decodeScan(data, ctx);
}

// ─── JPEG structures ──────────────────────────────────────────────────────────

interface Component {
	acTableId: number;
	dcTableId: number;
	hSample: number;
	id: number;
	quantId: number;
	vSample: number;
}

interface JpegCtx {
	acTables: Map<number, HuffmanTable>;
	components: Array<Component>;
	dcTables: Map<number, HuffmanTable>;
	height: number;
	quantTables: Map<number, Uint16Array>;
	scanOffset: number; // byte offset of scan data start (after SOS segment)
	width: number;
}

// ─── Marker parser ────────────────────────────────────────────────────────────

function parseMarkers(data: Uint8Array): JpegCtx {
	const ctx: JpegCtx = {
		acTables: new Map(),
		components: [],
		dcTables: new Map(),
		height: 0,
		quantTables: new Map(),
		scanOffset: 0,
		width: 0,
	};

	let pos = 0;
	if (data[pos++] !== 0xff || data[pos++] !== 0xd8) throw new Error('Not a JPEG');

	while (pos < data.length) {
		if (data[pos] !== 0xff) {
			pos++;
			continue;
		}
		while (data[pos] === 0xff) pos++;
		const marker = data[pos++];
		if (marker === 0xd9) break; // EOI
		if (marker === 0xd8) continue; // SOI (nested — ignore)
		if (marker >= 0xd0 && marker <= 0xd7) continue; // RST markers

		const segLen = ((data[pos] << 8) | data[pos + 1]) - 2;
		pos += 2;
		const seg = data.subarray(pos, pos + segLen);
		pos += segLen;

		if (marker === 0xdb) parseDQT(seg, ctx);
		else if (marker === 0xc4) parseDHT(seg, ctx);
		else if (marker === 0xc0 || marker === 0xc1) parseSOF(seg, ctx);
		else if (marker === 0xda) {
			parseSOS(seg, ctx);
			ctx.scanOffset = pos; // entropy-coded data starts here
			break;
		}
	}

	if (ctx.width === 0) throw new Error('JPEG: SOF not found');
	if (ctx.scanOffset === 0) throw new Error('JPEG: SOS not found');
	return ctx;
}

function parseDQT(seg: Uint8Array, ctx: JpegCtx): void {
	let p = 0;
	while (p < seg.length) {
		const precId = seg[p++];
		const id = precId & 0x0f;
		const is16 = precId >> 4 !== 0;
		const table = new Uint16Array(64);
		for (let i = 0; i < 64; i++) {
			table[i] = is16 ? (seg[p] << 8) | seg[p + 1] : seg[p];
			p += is16 ? 2 : 1;
		}
		ctx.quantTables.set(id, table);
	}
}

function parseDHT(seg: Uint8Array, ctx: JpegCtx): void {
	let p = 0;
	while (p < seg.length) {
		const tcId = seg[p++];
		const isDC = tcId >> 4 === 0;
		const id = tcId & 0x0f;
		const counts = seg.subarray(p, p + 16);
		p += 16;
		let total = 0;
		for (const c of counts) total += c;
		const symbols = seg.subarray(p, p + total);
		p += total;
		const table = buildHuffmanTable(counts, symbols);
		if (isDC) ctx.dcTables.set(id, table);
		else ctx.acTables.set(id, table);
	}
}

function parseSOF(seg: Uint8Array, ctx: JpegCtx): void {
	// precision = seg[0] (ignored)
	ctx.height = (seg[1] << 8) | seg[2];
	ctx.width = (seg[3] << 8) | seg[4];
	const nComp = seg[5];
	ctx.components = [];
	for (let i = 0; i < nComp; i++) {
		const base = 6 + i * 3;
		const sampling = seg[base + 1];
		ctx.components.push({
			acTableId: 0,
			dcTableId: 0,
			hSample: (sampling >> 4) & 0x0f,
			id: seg[base],
			quantId: seg[base + 2],
			vSample: sampling & 0x0f,
		});
	}
}

function parseSOS(seg: Uint8Array, ctx: JpegCtx): void {
	const nComp = seg[0];
	for (let i = 0; i < nComp; i++) {
		const compId = seg[1 + i * 2];
		const tables = seg[2 + i * 2];
		const comp = ctx.components.find((c) => c.id === compId);
		if (comp) {
			comp.dcTableId = (tables >> 4) & 0x0f;
			comp.acTableId = tables & 0x0f;
		}
	}
}

// ─── Scan decoder ─────────────────────────────────────────────────────────────

function decodeScan(data: Uint8Array, ctx: JpegCtx): Uint8Array {
	// De-stuff the entropy-coded data (remove 0x00 after 0xff)
	const scanRaw: Array<number> = [];
	for (let i = ctx.scanOffset; i < data.length - 1; i++) {
		if (data[i] === 0xff && data[i + 1] === 0x00) {
			scanRaw.push(0xff);
			i++;
		} else if (data[i] === 0xff && data[i + 1] !== 0x00) {
			break; // end of entropy data (next marker)
		} else {
			scanRaw.push(data[i]);
		}
	}

	const reader = new JpegBitReader(new Uint8Array(scanRaw));

	// Determine MCU grid dimensions
	const maxH = Math.max(...ctx.components.map((c) => c.hSample));
	const maxV = Math.max(...ctx.components.map((c) => c.vSample));
	const mcuW = maxH * 8;
	const mcuH = maxV * 8;
	const mcusX = Math.ceil(ctx.width / mcuW);
	const mcusY = Math.ceil(ctx.height / mcuH);
	const totalMCUs = mcusX * mcusY;

	const samples = new Uint8Array(totalMCUs * 4);
	const dcPred = new Int32Array(ctx.components.length);

	for (let mcu = 0; mcu < totalMCUs; mcu++) {
		const compValues: Array<number> = [];

		for (let ci = 0; ci < ctx.components.length; ci++) {
			const comp = ctx.components[ci];
			const dcTable = ctx.dcTables.get(comp.dcTableId);
			const acTable = ctx.acTables.get(comp.acTableId);
			if (!dcTable || !acTable) throw new Error('JPEG: missing Huffman table');

			// Each component may have multiple blocks per MCU (for subsampling)
			const blocksPerMCU = comp.hSample * comp.vSample;
			let blockAvg = 0;

			for (let b = 0; b < blocksPerMCU; b++) {
				// Decode DC coefficient
				const dcCat = huffDecode(reader, dcTable);
				const dcDiff = dcCat === 0 ? 0 : receiveExtend(reader, dcCat);
				dcPred[ci] += dcDiff;

				// The DC value represents the sum of all 8×8 block pixels / 8
				// Multiply by quant[0] to get the actual DC coefficient
				const quant = ctx.quantTables.get(comp.quantId);
				const dcVal = dcPred[ci] * (quant ? quant[0] : 1);
				// Clamp DC coefficient to valid pixel range: DC/8 + 128
				blockAvg += Math.max(0, Math.min(255, Math.round(dcVal / 8 + 128)));

				// Skip all 63 AC coefficients
				let k = 1;
				while (k < 64) {
					const acSym = huffDecode(reader, acTable);
					if (acSym === 0x00) break; // EOB
					if (acSym === 0xf0) {
						k += 16;
						continue;
					} // ZRL
					k += (acSym >> 4) + 1; // run of zeros + 1 non-zero
					const acSize = acSym & 0x0f;
					if (acSize > 0) receiveExtend(reader, acSize);
				}
			}

			compValues.push(Math.round(blockAvg / blocksPerMCU));
		}

		// Convert YCbCr (or grayscale) to RGB
		let r: number, g: number, b: number;
		if (ctx.components.length === 1) {
			r = g = b = compValues[0];
		} else {
			const Y = compValues[0];
			const Cb = compValues[1] - 128;
			const Cr = compValues[2] - 128;
			r = Math.max(0, Math.min(255, Math.round(Y + 1.402 * Cr)));
			g = Math.max(0, Math.min(255, Math.round(Y - 0.344136 * Cb - 0.714136 * Cr)));
			b = Math.max(0, Math.min(255, Math.round(Y + 1.772 * Cb)));
		}

		samples[mcu * 4] = r;
		samples[mcu * 4 + 1] = g;
		samples[mcu * 4 + 2] = b;
		samples[mcu * 4 + 3] = 255;
	}

	return samples;
}

function receiveExtend(reader: JpegBitReader, size: number): number {
	const val = reader.readBits(size);
	if (val < 1 << (size - 1)) return val - (1 << size) + 1;
	return val;
}

// ─── Huffman (MSB-first, as required by JPEG) ─────────────────────────────────

interface HuffmanTable {
	huffval: Uint8Array;
	maxCode: Int32Array;
	// minCode[len], maxCode[len], valPtr[len] for lengths 1-16
	minCode: Int32Array;
	valPtr: Int32Array;
}

function buildHuffmanTable(counts: Uint8Array, symbols: Uint8Array): HuffmanTable {
	const minCode = new Int32Array(17).fill(-1);
	const maxCode = new Int32Array(17).fill(-1);
	const valPtr = new Int32Array(17);
	let code = 0;
	let idx = 0;
	for (let len = 1; len <= 16; len++) {
		const n = counts[len - 1];
		if (n > 0) {
			minCode[len] = code;
			maxCode[len] = code + n - 1;
			valPtr[len] = idx;
			idx += n;
			code += n;
		}
		code <<= 1;
	}
	return { huffval: new Uint8Array(symbols), maxCode, minCode, valPtr };
}

function huffDecode(reader: JpegBitReader, table: HuffmanTable): number {
	let code = 0;
	for (let len = 1; len <= 16; len++) {
		code = (code << 1) | reader.readBits(1);
		if (table.maxCode[len] !== -1 && code <= table.maxCode[len] && code >= table.minCode[len]) {
			return table.huffval[table.valPtr[len] + (code - table.minCode[len])];
		}
	}
	throw new Error('JPEG: invalid Huffman code');
}

// ─── Bit reader (MSB-first for JPEG) ─────────────────────────────────────────

class JpegBitReader {
	private buf: Uint8Array;
	private pos = 0;
	private bitBuf = 0;
	private bitCount = 0;

	constructor(buf: Uint8Array) {
		this.buf = buf;
	}

	readBits(n: number): number {
		while (this.bitCount < n) {
			const byte = this.pos < this.buf.length ? this.buf[this.pos++] : 0;
			this.bitBuf = (this.bitBuf << 8) | byte;
			this.bitCount += 8;
		}
		this.bitCount -= n;
		return (this.bitBuf >>> this.bitCount) & ((1 << n) - 1);
	}
}
