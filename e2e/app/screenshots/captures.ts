import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

export const CAPTURE_DIR = './generated/screenshots';

const README_DIR = './generated/readme';
const README_GAP = 48;

// each readme section embeds one image built from two captures, left then right
const SECTIONS = [
	{ left: 'player', name: 'player', right: 'player-queue' },
	{ left: 'home', name: 'home', right: 'home-scrolled' },
	{ left: 'artist', name: 'artist', right: 'artist-scrolled' },
	{ left: 'library', name: 'library', right: 'genre' },
	{ left: 'album', name: 'album', right: 'album-scrolled' },
	{ left: 'search', name: 'search-settings', right: 'settings' },
];

// webdriver saves the raw framebuffer, which squares off the corners the device rounds and drops
// nothing else; simctl applies the display mask as alpha, so captures keep the real screen shape
export async function saveCapture(name: string): Promise<void> {
	const file = `${CAPTURE_DIR}/${name}.png`;
	const capabilities = browser.capabilities as Record<string, unknown>;

	if (String(capabilities.platformName ?? '').toLowerCase() === 'ios') {
		try {
			const udid = String(capabilities.udid ?? 'booted');
			const args = ['simctl', 'io', udid, 'screenshot', '--mask=alpha', file];
			execFileSync('xcrun', args, { stdio: 'ignore' });
			return;
		} catch {
			// a real device has no simulator to ask, so fall back to the framebuffer
		}
	}

	await browser.saveScreenshot(file);
}

export async function combineReadmeImages(): Promise<void> {
	const missing = SECTIONS.flatMap((section) => [section.left, section.right]).filter(
		(capture) => !existsSync(`${CAPTURE_DIR}/${capture}.png`),
	);

	// a bailed run leaves an incomplete set: the test failure is the error worth reporting, so say
	// what is missing and leave the previous readme images alone rather than failing again here
	if (missing.length > 0) {
		console.error(`skipped combining readme images, missing captures: ${missing.join(', ')}`);
		return;
	}

	for (const section of SECTIONS) {
		await joinSideBySide(
			`${CAPTURE_DIR}/${section.left}.png`,
			`${CAPTURE_DIR}/${section.right}.png`,
			`${README_DIR}/${section.name}.png`,
		);
	}
}

// the canvas stays transparent so the masked corners of each capture read as rounded on whatever
// background the readme is viewed against
async function joinSideBySide(leftPath: string, rightPath: string, outPath: string): Promise<void> {
	const left = resolve(leftPath);
	const right = resolve(rightPath);
	const out = resolve(outPath);

	const [leftMeta, rightMeta] = await Promise.all([
		sharp(left).metadata(),
		sharp(right).metadata(),
	]);

	if (leftMeta.width !== rightMeta.width || leftMeta.height !== rightMeta.height) {
		throw new Error(
			`captures must be the same size: ${leftMeta.width}x${leftMeta.height} vs ${rightMeta.width}x${rightMeta.height}`,
		);
	}

	const width = leftMeta.width * 2 + README_GAP;
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
			{ input: right, left: leftMeta.width + README_GAP, top: 0 },
		])
		.png()
		.toFile(out);

	console.log(`wrote ${out} (${width}x${height})`);
}
