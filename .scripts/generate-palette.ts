// contact sheet of every icon in atolla/res, grouped by viewBox: 24x24 in a square grid,
// 48x24 on their own rows, everything else skipped
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const RES = resolve(process.cwd(), 'atolla/res');
const OUT =
	process.argv.find((arg) => arg.endsWith('.png')) ??
	resolve(process.cwd(), 'generated/icon-palette.png');
const COLOUR = process.argv.includes('--colour') || process.argv.includes('--color');

const DENSITY = 600;
const CELL = 96;
const GAP = 8;
const COLS = 6;

const SILHOUETTE: [number, number, number] = [102, 204, 255];
const GUIDE: [number, number, number] = [90, 90, 110];
const BG = { alpha: 1, b: 24, g: 20, r: 20 };

function parseViewBox(svg: string): [number, number, number, number] | undefined {
	const match = svg.match(/viewBox="([\d.\-\s]+)"/);
	if (!match) return undefined;
	const parts = match[1].trim().split(/\s+/).map(Number);
	if (parts.length !== 4 || parts.some(Number.isNaN)) return undefined;
	return [parts[0], parts[1], parts[2], parts[3]];
}

// draws a centre crosshair and cell frame so alignment is easy to judge
async function tile(name: string, w: number, h: number): Promise<Buffer> {
	const { data, info } = await sharp(resolve(RES, `${name}.svg`), { density: DENSITY })
		.resize(w, h, { fit: 'fill' })
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	const ch = info.channels;
	const cx = Math.floor(info.width / 2);
	const cy = Math.floor(info.height / 2);
	for (let i = 0; i < info.width * info.height; i++) {
		const alpha = data[i * ch + ch - 1];
		const x = i % info.width;
		const y = Math.floor(i / info.width);
		const onGuide =
			x === cx || y === cy || x === 0 || y === 0 || x === info.width - 1 || y === info.height - 1;
		if (alpha > 16) {
			if (!COLOUR) {
				data[i * ch] = SILHOUETTE[0];
				data[i * ch + 1] = SILHOUETTE[1];
				data[i * ch + 2] = SILHOUETTE[2];
				data[i * ch + 3] = 255;
			}
		} else if (onGuide) {
			data[i * ch] = GUIDE[0];
			data[i * ch + 1] = GUIDE[1];
			data[i * ch + 2] = GUIDE[2];
			data[i * ch + 3] = 255;
		}
	}
	return sharp(data, { raw: { channels: ch, height: info.height, width: info.width } })
		.png()
		.toBuffer();
}

const square: Array<string> = [];
const wide: Array<string> = [];
const skipped: Array<string> = [];
for (const file of readdirSync(RES).sort()) {
	if (!file.endsWith('.svg')) continue;
	const name = file.slice(0, -4);
	const vb = parseViewBox(readFileSync(resolve(RES, file), 'utf8'));
	if (vb && vb[2] === 24 && vb[3] === 24) square.push(name);
	else if (vb && vb[2] === 48 && vb[3] === 24) wide.push(name);
	else skipped.push(name);
}

const composites: Array<sharp.OverlayOptions> = [];
let row = 0;
let col = 0;
for (const name of square) {
	composites.push({
		input: await tile(name, CELL, CELL),
		left: GAP + col * (CELL + GAP),
		top: GAP + row * (CELL + GAP),
	});
	col += 1;
	if (col === COLS) {
		col = 0;
		row += 1;
	}
}
if (col !== 0) row += 1;

const widePitch = 2 * CELL + GAP;
const widePerRow = Math.floor(COLS / 2);
let wideCol = 0;
for (const name of wide) {
	composites.push({
		input: await tile(name, CELL * 2, CELL),
		left: GAP + wideCol * widePitch,
		top: GAP + row * (CELL + GAP),
	});
	wideCol += 1;
	if (wideCol === widePerRow) {
		wideCol = 0;
		row += 1;
	}
}
if (wideCol !== 0) row += 1;

const width = GAP + COLS * (CELL + GAP);
const height = GAP + row * (CELL + GAP);

mkdirSync(dirname(OUT), { recursive: true });
await sharp({ create: { background: BG, channels: 4, height, width } })
	.composite(composites)
	.png()
	.toFile(OUT);

console.log(`wrote ${OUT} (${square.length} square + ${wide.length} double-wide)`);
if (skipped.length > 0) console.log(`skipped (not 24x24 / 48x24): ${skipped.join(', ')}`);
