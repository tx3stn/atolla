import { access, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import sharp from 'sharp';

type IconOutput = {
	path: string;
	size: number;
};

const sourceSvgPath = resolve(process.cwd(), 'atolla/res/logo.svg');

const outputs: Array<IconOutput> = [
	{ path: resolve(process.cwd(), 'generated/icons/ios/app-store-1024.png'), size: 1024 },
	{
		path: resolve(process.cwd(), 'generated/icons/android/ic_launcher-48.png'),
		size: 48,
	},
	{
		path: resolve(process.cwd(), 'generated/icons/android/ic_launcher-72.png'),
		size: 72,
	},
	{
		path: resolve(process.cwd(), 'generated/icons/android/ic_launcher-96.png'),
		size: 96,
	},
	{
		path: resolve(process.cwd(), 'generated/icons/android/ic_launcher-144.png'),
		size: 144,
	},
	{
		path: resolve(process.cwd(), 'generated/icons/android/ic_launcher-192.png'),
		size: 192,
	},
	{
		path: resolve(process.cwd(), 'generated/icons/android/ic_launcher-512.png'),
		size: 512,
	},
	{ path: resolve(process.cwd(), 'generated/icons/web/icon-32.png'), size: 32 },
	{ path: resolve(process.cwd(), 'generated/icons/web/icon-64.png'), size: 64 },
	{ path: resolve(process.cwd(), 'generated/icons/web/icon-128.png'), size: 128 },
	{ path: resolve(process.cwd(), 'generated/icons/web/icon-192.png'), size: 192 },
	{ path: resolve(process.cwd(), 'generated/icons/web/icon-256.png'), size: 256 },
	{ path: resolve(process.cwd(), 'generated/icons/web/icon-512.png'), size: 512 },
	{
		path: resolve(process.cwd(), 'atolla/native/android/res/mipmap-mdpi/ic_launcher.png'),
		size: 48,
	},
	{
		path: resolve(process.cwd(), 'atolla/native/android/res/mipmap-hdpi/ic_launcher.png'),
		size: 72,
	},
	{
		path: resolve(process.cwd(), 'atolla/native/android/res/mipmap-xhdpi/ic_launcher.png'),
		size: 96,
	},
	{
		path: resolve(process.cwd(), 'atolla/native/android/res/mipmap-xxhdpi/ic_launcher.png'),
		size: 144,
	},
	{
		path: resolve(process.cwd(), 'atolla/native/android/res/mipmap-xxxhdpi/ic_launcher.png'),
		size: 192,
	},
];

async function generateIcons(): Promise<void> {
	for (const output of outputs) {
		await mkdir(dirname(output.path), { recursive: true });

		const isAndroidOutput = output.path.includes('/android/');
		const padding = isAndroidOutput ? 0 : Math.round(output.size * 0.01);
		const contentSize = output.size - padding * 2;
		const fitMode = isAndroidOutput ? 'cover' : 'contain';

		await sharp(sourceSvgPath, { density: 512, limitInputPixels: false })
			.trim({ threshold: 0 })
			.resize(contentSize, contentSize, {
				background: { alpha: 0, b: 0, g: 0, r: 0 },
				fit: fitMode,
			})
			.extend({
				background: { alpha: 0, b: 0, g: 0, r: 0 },
				bottom: padding,
				left: padding,
				right: padding,
				top: padding,
			})
			.png({ compressionLevel: 9 })
			.toFile(output.path);
	}
}

async function validateIcons(): Promise<void> {
	await access(sourceSvgPath);

	const failures: Array<string> = [];

	for (const output of outputs) {
		try {
			await access(output.path);
			const metadata = await sharp(output.path).metadata();
			if (metadata.width !== output.size || metadata.height !== output.size) {
				failures.push(
					`size mismatch: ${output.path} expected ${output.size}x${output.size} got ${metadata.width}x${metadata.height}`,
				);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			failures.push(`missing or unreadable: ${output.path} (${message})`);
		}
	}

	if (failures.length > 0) {
		throw new Error(`Icon validation failed:\n${failures.join('\n')}`);
	}
}

async function main(): Promise<void> {
	console.log('Generating icons from atolla/res/logo.svg...');
	await generateIcons();

	console.log('Validating generated icons...');
	await validateIcons();

	console.log(`Icon generation/validation complete: ${outputs.length} files OK`);
}

await main();
