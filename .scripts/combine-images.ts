import { resolve } from 'node:path';
import sharp from 'sharp';

const OUT = resolve(process.cwd(), 'combined.png');
const GAP = 48;

const IPHONE_17_SCREEN_WIDTH = 1206;
const IPHONE_17_CORNER_RADIUS = 188;

type Image = { data: Buffer; height: number; width: number };

async function hasTransparentCorner(path: string): Promise<boolean> {
	const corner = await sharp(path)
		.ensureAlpha()
		.extract({ height: 1, left: 0, top: 0, width: 1 })
		.raw()
		.toBuffer();

	return corner[3] < 255;
}

async function withRoundedCorners(path: string): Promise<Image> {
	const { height, width } = await sharp(path).metadata();

	if (await hasTransparentCorner(path)) {
		return { data: await sharp(path).png().toBuffer(), height, width };
	}

	const radius = Math.round(
		(Math.min(width, height) * IPHONE_17_CORNER_RADIUS) / IPHONE_17_SCREEN_WIDTH,
	);
	const mask = Buffer.from(
		`<svg width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${radius}" ry="${radius}"/></svg>`,
	);
	const data = await sharp(path)
		.ensureAlpha()
		.composite([{ blend: 'dest-in', input: mask }])
		.png()
		.toBuffer();

	return { data, height, width };
}

const [leftArg, rightArg] = process.argv.slice(2);

if (!leftArg || !rightArg) {
	console.error('usage: bun run combine <left image> <right image>');
	process.exit(1);
}

const [left, right] = await Promise.all([
	withRoundedCorners(resolve(process.cwd(), leftArg)),
	withRoundedCorners(resolve(process.cwd(), rightArg)),
]);

const width = left.width + GAP + right.width;
const height = Math.max(left.height, right.height);

await sharp({
	create: {
		background: { alpha: 0, b: 0, g: 0, r: 0 },
		channels: 4,
		height,
		width,
	},
})
	.composite([
		{ input: left.data, left: 0, top: 0 },
		{ input: right.data, left: left.width + GAP, top: 0 },
	])
	.png()
	.toFile(OUT);

console.log(`wrote ${OUT} (${width}x${height})`);
