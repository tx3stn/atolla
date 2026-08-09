// joins two same-sized images side by side on a transparent canvas, so a pair of
// screenshots can be attached as a single release image
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const DEFAULT_GAP = 48;
const DEFAULT_OUT = 'generated/combined.png';

function flag(name: string): string | undefined {
	const index = process.argv.indexOf(`--${name}`);
	return index === -1 ? undefined : process.argv[index + 1];
}

const inputs = process.argv.slice(2).filter((arg, index, args) => {
	if (arg.startsWith('--')) return false;
	return !args[index - 1]?.startsWith('--');
});

if (inputs.length !== 2) {
	console.error(
		'usage: bun run screenshots:combine <left.png> <right.png> [--out path] [--gap px]',
	);
	process.exit(1);
}

const [left, right] = inputs.map((input) => resolve(input));
const out = resolve(flag('out') ?? DEFAULT_OUT);
const gap = Number(flag('gap') ?? DEFAULT_GAP);

if (!Number.isFinite(gap) || gap < 0) {
	console.error(`--gap must be a positive number, got "${flag('gap')}"`);
	process.exit(1);
}

const [leftMeta, rightMeta] = await Promise.all([sharp(left).metadata(), sharp(right).metadata()]);

if (leftMeta.width !== rightMeta.width || leftMeta.height !== rightMeta.height) {
	console.error(
		`images must be the same size: ${leftMeta.width}x${leftMeta.height} vs ${rightMeta.width}x${rightMeta.height}`,
	);
	process.exit(1);
}

const width = leftMeta.width * 2 + gap;
const height = leftMeta.height;

mkdirSync(dirname(out), { recursive: true });
await sharp({
	create: {
		background: { alpha: 0, b: 0, g: 0, r: 0 },
		channels: 4,
		height,
		width,
	},
})
	.composite([
		{ input: left, left: 0, top: 0 },
		{ input: right, left: leftMeta.width + gap, top: 0 },
	])
	.png()
	.toFile(out);

console.log(`wrote ${out} (${width}x${height}, ${gap}px gap)`);
