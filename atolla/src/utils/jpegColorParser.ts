type HuffTable = Map<number, number>; // key: (code << 5) | length → symbol

/**
 * Extracts the dominant color of a JPEG by reading DC coefficients from the
 * first MCU. Returns a hex color string like '#rrggbb', or null if the data
 * cannot be parsed.
 */
export function parseJpegColor(data: Uint8Array): string | null {
	if (data[0] !== 0xff || data[1] !== 0xd8) return null;

	let pos = 2;
	const dqt: Array<Array<number>> = [];
	const dcTables: Array<HuffTable> = [];
	const acTables: Array<HuffTable> = [];
	let sofComponents: Array<{ id: number; hSamp: number; vSamp: number; qtId: number }> = [];
	let sosComponents: Array<{ compId: number; dcId: number; acId: number }> = [];
	let scanStart = -1;

	while (pos < data.length - 1) {
		if (data[pos] !== 0xff) break;
		const marker = data[pos + 1];
		pos += 2;

		if (marker === 0xd8) continue; // SOI
		if (marker === 0xd9) break; // EOI

		if (marker === 0xda) {
			// SOS — parse header then stop, scan data follows
			const len = (data[pos] << 8) | data[pos + 1];
			const nComp = data[pos + 2];
			sosComponents = [];
			for (let i = 0; i < nComp; i++) {
				const compId = data[pos + 3 + i * 2];
				const tableIds = data[pos + 4 + i * 2];
				sosComponents.push({ acId: tableIds & 0xf, compId, dcId: (tableIds >> 4) & 0xf });
			}
			scanStart = pos + len;
			break;
		}

		const len = (data[pos] << 8) | data[pos + 1];

		if (marker === 0xdb) {
			// DQT — quantization table(s)
			let i = pos + 2;
			while (i < pos + len) {
				const b = data[i++];
				const precision = (b >> 4) & 0xf;
				const tableId = b & 0xf;
				const values: Array<number> = [];
				for (let k = 0; k < 64; k++) {
					values.push(precision === 0 ? data[i++] : (data[i++] << 8) | data[i++]);
				}
				dqt[tableId] = values;
			}
		} else if (marker === 0xc0) {
			// SOF0 — baseline frame header
			const nComp = data[pos + 7];
			sofComponents = [];
			for (let i = 0; i < nComp; i++) {
				const base = pos + 8 + i * 3;
				const samp = data[base + 1];
				sofComponents.push({
					hSamp: (samp >> 4) & 0xf,
					id: data[base],
					qtId: data[base + 2],
					vSamp: samp & 0xf,
				});
			}
		} else if (marker === 0xc4) {
			// DHT — Huffman table(s)
			let i = pos + 2;
			while (i < pos + len) {
				const b = data[i++];
				const tableClass = (b >> 4) & 0xf;
				const tableId = b & 0xf;
				const codeLengths: Array<number> = [];
				let totalCodes = 0;
				for (let k = 0; k < 16; k++) {
					const count = data[i++];
					codeLengths.push(count);
					totalCodes += count;
				}
				const symbols: Array<number> = [];
				for (let k = 0; k < totalCodes; k++) symbols.push(data[i++]);
				const table = buildHuffTable(codeLengths, symbols);
				if (tableClass === 0) dcTables[tableId] = table;
				else acTables[tableId] = table;
			}
		}

		pos += len;
	}

	if (scanStart < 0 || sofComponents.length < 3 || sosComponents.length < 3) return null;

	const reader = new BitReader(data, scanStart);
	const compById = new Map(sofComponents.map((c) => [c.id, c]));
	const prevDc = [0, 0, 0, 0];
	const dcValues: Array<number> = [];

	for (let ci = 0; ci < sosComponents.length; ci++) {
		const sos = sosComponents[ci];
		const sof = compById.get(sos.compId);
		if (!sof) return null;

		const dcTable = dcTables[sos.dcId];
		const acTable = acTables[sos.acId];
		if (!dcTable || !acTable) return null;

		// Decode all blocks in this component's slice of the first MCU
		const nBlocks = sof.hSamp * sof.vSamp;
		for (let b = 0; b < nBlocks; b++) {
			const dc = readDcCoeff(reader, dcTable, prevDc[ci]);
			prevDc[ci] = dc;
			if (b === 0) dcValues.push(dc);
			skipAcCoeffs(reader, acTable);
		}
	}

	if (dcValues.length < 3) return null;

	const yQt = dqt[sofComponents[0].qtId];
	const cbQt = dqt[sofComponents[1].qtId] ?? yQt;
	const crQt = dqt[sofComponents[2].qtId] ?? yQt;
	if (!yQt) return null;

	// Dequantize DC coefficients and apply JPEG level shift (+128)
	const Y = dcValues[0] * yQt[0] + 128;
	const Cb = dcValues[1] * cbQt[0] + 128;
	const Cr = dcValues[2] * crQt[0] + 128;

	// ITU-T T.871 YCbCr → RGB
	const r = clamp(Y + 1.402 * (Cr - 128));
	const g = clamp(Y - 0.344136 * (Cb - 128) - 0.714136 * (Cr - 128));
	const b = clamp(Y + 1.772 * (Cb - 128));

	return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function buildHuffTable(codeLengths: Array<number>, symbols: Array<number>): HuffTable {
	const table: HuffTable = new Map();
	let code = 0;
	let symIdx = 0;
	for (let len = 1; len <= 16; len++) {
		for (let i = 0; i < codeLengths[len - 1]; i++) {
			table.set((code << 5) | len, symbols[symIdx++]);
			code++;
		}
		code <<= 1;
	}
	return table;
}

function readHuffSymbol(reader: BitReader, table: HuffTable): number {
	let code = 0;
	for (let len = 1; len <= 16; len++) {
		code = (code << 1) | reader.readBit();
		const sym = table.get((code << 5) | len);
		if (sym !== undefined) return sym;
	}
	throw new Error('invalid huffman code');
}

function readDcCoeff(reader: BitReader, dcTable: HuffTable, prevDc: number): number {
	const category = readHuffSymbol(reader, dcTable);
	if (category === 0) return prevDc;
	let value = reader.readBits(category);
	// Two's complement: if MSB is 0 the value is negative
	if (value < 1 << (category - 1)) value -= (1 << category) - 1;
	return prevDc + value;
}

function skipAcCoeffs(reader: BitReader, acTable: HuffTable): void {
	let k = 1;
	while (k < 64) {
		const sym = readHuffSymbol(reader, acTable);
		if (sym === 0x00) break; // EOB
		if (sym === 0xf0) {
			k += 16;
			continue;
		} // ZRL
		k += ((sym >> 4) & 0xf) + 1;
		reader.readBits(sym & 0xf);
	}
}

class BitReader {
	private bitBuf = 0;
	private bitsLeft = 0;

	constructor(
		private data: Uint8Array,
		private pos: number,
	) {}

	readBit(): number {
		if (this.bitsLeft === 0) {
			const byte = this.data[this.pos++] ?? 0;
			// JPEG byte stuffing: 0xFF 0x00 in scan data means literal 0xFF
			if (byte === 0xff && this.data[this.pos] === 0x00) this.pos++;
			this.bitBuf = byte;
			this.bitsLeft = 8;
		}
		this.bitsLeft--;
		return (this.bitBuf >> this.bitsLeft) & 1;
	}

	readBits(n: number): number {
		let result = 0;
		for (let i = 0; i < n; i++) result = (result << 1) | this.readBit();
		return result;
	}
}

function clamp(v: number): number {
	return Math.max(0, Math.min(255, Math.round(v)));
}
