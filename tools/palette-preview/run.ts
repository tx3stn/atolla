// palette tuning preview. for every album-art image in the input dir, runs the real Zig palette
// algorithm (via a freshly built dylib, so tweaks take effect), renders the real NowPlayingSurface
// with that palette + artwork to a PNG (the bazel //tools/palette-preview CLI, ./src/main.tsx), and
// tiles the results into a contact sheet with labelled swatches for before/after comparison.
//
// run with: bun run palette:preview [--input <dir>]  (or: bun ./tools/palette-preview/run.ts)

import { dlopen, FFIType, ptr } from 'bun:ffi';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import sharp from 'sharp';

interface ManifestPalette {
	accent: string;
	muted_on_surface: string;
	on_surface: string;
	surface: string;
}

interface ManifestEntry {
	artworkPath: string;
	blurredPath: string;
	collapsedOutPath: string;
	height: number;
	outPath: string;
	palette: ManifestPalette;
	track: { albumName: string; artistName: string; duration: number; name: string };
	width: number;
}

const PALETTE_FIELDS = ['accent', 'surface', 'on_surface', 'muted_on_surface'] as const;

const CWD = process.cwd();
const WIDTH = 390;
const HEIGHT = 844;
const THUMB_HEIGHT = 560;
const SWATCH_WIDTH = 360;
const GAP = 16;
const COLUMNS = 4;
const COLLAPSED_CROP = { height: 126, left: 6, top: 42, width: 378 };
const BG = { alpha: 1, b: 22, g: 15, r: 11 };

const inputArgIndex = process.argv.indexOf('--input');
const inputDir =
	inputArgIndex !== -1 && process.argv[inputArgIndex + 1]
		? resolve(CWD, process.argv[inputArgIndex + 1])
		: resolve(CWD, 'tools/palette-preview/samples');
const outDir = resolve(CWD, 'generated/palette-preview');
const scratchDir = resolve(outDir, '.work');

function run(command: string, args: Array<string>): void {
	const result = spawnSync(command, args, { cwd: CWD, stdio: 'inherit' });
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`);
	}
}

function nextVersionedPath(dir: string, base: string, ext: string): string {
	let index = 1;
	let candidate = resolve(dir, `${base}.${ext}`);
	while (existsSync(candidate)) {
		index++;
		candidate = resolve(dir, `${base}-${index}.${ext}`);
	}
	return candidate;
}

function readHex(buffer: Uint8Array, offset: number): string {
	let hex = '';
	for (let i = offset; i < offset + 8 && buffer[i] !== 0; i++) {
		hex += String.fromCharCode(buffer[i]);
	}
	return hex;
}

function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function swatchSvg(name: string, palette: ManifestPalette): Buffer {
	const rowHeight = 84;
	const square = 48;
	const pad = 22;
	const top = 56;
	const rows = PALETTE_FIELDS.map((field, index) => {
		const hex = palette[field];
		const y = top + index * rowHeight;
		return `
    <rect x="${pad}" y="${y}" width="${square}" height="${square}" rx="8" fill="${hex}" stroke="#333" stroke-width="1"/>
    <text x="${pad + square + 18}" y="${y + 20}" font-family="monospace" font-size="18" fill="#e6e6e6">${field}</text>
    <text x="${pad + square + 18}" y="${y + 42}" font-family="monospace" font-size="18" fill="#9aa0aa">${hex}</text>`;
	}).join('');
	return Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${SWATCH_WIDTH}" height="${THUMB_HEIGHT}">
    <rect width="${SWATCH_WIDTH}" height="${THUMB_HEIGHT}" fill="rgb(${BG.r},${BG.g},${BG.b})"/>
    <text x="${pad}" y="34" font-family="monospace" font-size="22" fill="#ffffff">${escapeXml(name)}</text>${rows}
  </svg>`,
	);
}

async function buildCard(entry: ManifestEntry): Promise<Buffer> {
	const surface = await sharp(entry.outPath)
		.resize({ height: THUMB_HEIGHT })
		.toBuffer({ resolveWithObject: true });
	const swatch = await sharp(swatchSvg(entry.track.name, entry.palette)).png().toBuffer();
	const surfaceWidth = surface.info.width;
	const collapsed = await sharp(entry.collapsedOutPath)
		.extract(COLLAPSED_CROP)
		.resize({ width: surfaceWidth })
		.toBuffer({ resolveWithObject: true });
	const cardWidth = surfaceWidth + GAP + SWATCH_WIDTH;
	return sharp({
		create: { background: BG, channels: 4, height: THUMB_HEIGHT, width: cardWidth },
	})
		.composite([
			{ input: surface.data, left: 0, top: 0 },
			{ input: swatch, left: surfaceWidth + GAP, top: 0 },
			{
				input: collapsed.data,
				left: surfaceWidth + GAP,
				top: THUMB_HEIGHT - collapsed.info.height,
			},
		])
		.png()
		.toBuffer();
}

async function composeContactSheet(entries: Array<ManifestEntry>): Promise<void> {
	const cards: Array<{ data: Buffer; height: number; width: number }> = [];
	for (const entry of entries) {
		if (!existsSync(entry.outPath)) {
			console.warn(`no render for ${entry.track.name}, skipping in sheet`);
			continue;
		}
		const card = await buildCard(entry);
		const meta = await sharp(card).metadata();
		cards.push({ data: card, height: meta.height ?? THUMB_HEIGHT, width: meta.width ?? 0 });
	}
	if (cards.length === 0) {
		console.warn('no cards to compose');
		return;
	}

	const cellWidth = Math.max(...cards.map((c) => c.width));
	const cellHeight = Math.max(...cards.map((c) => c.height));
	const columns = Math.min(COLUMNS, cards.length);
	const rows = Math.ceil(cards.length / COLUMNS);
	const sheetWidth = GAP + columns * (cellWidth + GAP);
	const sheetHeight = GAP + rows * (cellHeight + GAP);
	const composites = cards.map((card, index) => ({
		input: card.data,
		left: GAP + (index % COLUMNS) * (cellWidth + GAP),
		top: GAP + Math.floor(index / COLUMNS) * (cellHeight + GAP),
	}));

	const sheetPath = nextVersionedPath(outDir, 'index', 'png');
	await sharp({
		create: { background: BG, channels: 4, height: sheetHeight, width: sheetWidth },
	})
		.composite(composites)
		.png()
		.toFile(sheetPath);
	console.info(`wrote ${sheetPath}`);
}

async function main(): Promise<void> {
	if (!existsSync(inputDir)) {
		throw new Error(
			`input dir ${inputDir} does not exist — drop album-art images there (or pass --input <dir>)`,
		);
	}
	mkdirSync(scratchDir, { recursive: true });

	const dylib = resolve(scratchDir, 'libatolla_palette.dylib');
	console.info('building palette dylib...');
	run('zig', [
		'build-lib',
		'atolla/native/zig/palette_extractor.zig',
		'-dynamic',
		'-lc',
		'-O',
		'ReleaseFast',
		`-femit-bin=${dylib}`,
	]);

	const lib = dlopen(dylib, {
		atolla_extract_palette: {
			args: [FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.ptr],
			returns: FFIType.bool,
		},
	});

	const images = readdirSync(inputDir)
		.filter((file) => /\.(png|jpe?g)$/i.test(file))
		.sort();
	if (images.length === 0) {
		throw new Error(`no .png/.jpg images found in ${inputDir}`);
	}

	const manifest: Array<ManifestEntry> = [];
	for (const file of images) {
		const name = basename(file, extname(file));
		const srcPath = resolve(inputDir, file);
		const { data, info } = await sharp(srcPath)
			.ensureAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });

		const out = new Uint8Array(32);
		const ok = lib.symbols.atolla_extract_palette(ptr(data), info.width, info.height, ptr(out));
		if (!ok) {
			console.warn(`extraction failed for ${file}, skipping`);
			continue;
		}
		const palette: ManifestPalette = {
			accent: readHex(out, 0),
			muted_on_surface: readHex(out, 24),
			on_surface: readHex(out, 16),
			surface: readHex(out, 8),
		};

		const blurredPath = resolve(scratchDir, `${name}.blur.jpg`);
		await sharp(srcPath)
			.resize(48, 48, { fit: 'cover' })
			.blur(6)
			.jpeg({ quality: 80 })
			.toFile(blurredPath);

		manifest.push({
			artworkPath: srcPath,
			blurredPath,
			collapsedOutPath: resolve(outDir, `${name}-collapsed.png`),
			height: HEIGHT,
			outPath: resolve(outDir, `${name}.png`),
			palette,
			track: { albumName: name, artistName: 'Preview Artist', duration: 214, name },
			width: WIDTH,
		});
		console.info(`${name}: ${PALETTE_FIELDS.map((f) => `${f}=${palette[f]}`).join(' ')}`);
	}
	lib.close();

	if (manifest.length === 0) {
		throw new Error('no palettes extracted');
	}

	const manifestPath = resolve(scratchDir, 'manifest.json');
	writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

	console.info('building palette_preview CLI (first build compiles Skia and can be slow)...');
	run('bazel', ['build', '//tools/palette-preview:palette_preview_cli']);
	const cliBin = resolve(CWD, 'bazel-bin/tools/palette-preview/palette_preview_cli');
	run(cliBin, ['--manifest', manifestPath]);

	await composeContactSheet(manifest);
}

await main();
