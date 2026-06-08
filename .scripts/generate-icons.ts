import { copyFileSync } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import sharp from 'sharp';

type Platform = 'android' | 'ios' | 'web';

type IconOutput = {
	monochrome?: boolean;
	noPadding?: boolean;
	path: string;
	platform: Platform;
	size: number;
};

const sourceSvgPath = resolve(process.cwd(), 'atolla/res/logo.svg');
const androidIconPaddingRatio = 0.28;
const iosIconPaddingRatio = 0.12;
const defaultIconPaddingRatio = 0.01;

const outputs: Array<IconOutput> = [
	{
		path: resolve(process.cwd(), 'generated/icons/ios/app-store-1024.png'),
		platform: 'ios',
		size: 1024,
	},
	{
		path: resolve(
			process.cwd(),
			'atolla/native/ios/Assets.xcassets/AppIcon.appiconset/icon-1024.png',
		),
		platform: 'ios',
		size: 1024,
	},
	{
		path: resolve(process.cwd(), 'generated/icons/android/ic_launcher-48.png'),
		platform: 'android',
		size: 48,
	},
	{
		path: resolve(process.cwd(), 'generated/icons/android/ic_launcher-72.png'),
		platform: 'android',
		size: 72,
	},
	{
		path: resolve(process.cwd(), 'generated/icons/android/ic_launcher-96.png'),
		platform: 'android',
		size: 96,
	},
	{
		path: resolve(process.cwd(), 'generated/icons/android/ic_launcher-144.png'),
		platform: 'android',
		size: 144,
	},
	{
		path: resolve(process.cwd(), 'generated/icons/android/ic_launcher-192.png'),
		platform: 'android',
		size: 192,
	},
	{
		path: resolve(process.cwd(), 'generated/icons/android/ic_launcher-512.png'),
		platform: 'android',
		size: 512,
	},
	{ path: resolve(process.cwd(), 'generated/icons/web/icon-32.png'), platform: 'web', size: 32 },
	{ path: resolve(process.cwd(), 'generated/icons/web/icon-64.png'), platform: 'web', size: 64 },
	{ path: resolve(process.cwd(), 'generated/icons/web/icon-128.png'), platform: 'web', size: 128 },
	{ path: resolve(process.cwd(), 'generated/icons/web/icon-192.png'), platform: 'web', size: 192 },
	{ path: resolve(process.cwd(), 'generated/icons/web/icon-256.png'), platform: 'web', size: 256 },
	{ path: resolve(process.cwd(), 'generated/icons/web/icon-512.png'), platform: 'web', size: 512 },
	{
		path: resolve(process.cwd(), 'atolla/native/android/res/mipmap-mdpi/ic_launcher.png'),
		platform: 'android',
		size: 48,
	},
	{
		path: resolve(process.cwd(), 'atolla/native/android/res/mipmap-hdpi/ic_launcher.png'),
		platform: 'android',
		size: 72,
	},
	{
		path: resolve(process.cwd(), 'atolla/native/android/res/mipmap-xhdpi/ic_launcher.png'),
		platform: 'android',
		size: 96,
	},
	{
		path: resolve(process.cwd(), 'atolla/native/android/res/mipmap-xxhdpi/ic_launcher.png'),
		platform: 'android',
		size: 144,
	},
	{
		path: resolve(process.cwd(), 'atolla/native/android/res/mipmap-xxxhdpi/ic_launcher.png'),
		platform: 'android',
		size: 192,
	},
	{
		path: resolve(process.cwd(), 'atolla/native/android/res/drawable/ic_launcher_foreground.png'),
		platform: 'android',
		size: 432,
	},
	{
		monochrome: true,
		path: resolve(process.cwd(), 'atolla/native/android/res/drawable/ic_launcher_monochrome.png'),
		platform: 'android',
		size: 432,
	},
	{
		monochrome: true,
		noPadding: true,
		path: resolve(process.cwd(), 'atolla/native/android/res/drawable-mdpi/ic_notification.png'),
		platform: 'android',
		size: 24,
	},
	{
		monochrome: true,
		noPadding: true,
		path: resolve(process.cwd(), 'atolla/native/android/res/drawable-hdpi/ic_notification.png'),
		platform: 'android',
		size: 36,
	},
	{
		monochrome: true,
		noPadding: true,
		path: resolve(process.cwd(), 'atolla/native/android/res/drawable-xhdpi/ic_notification.png'),
		platform: 'android',
		size: 48,
	},
	{
		monochrome: true,
		noPadding: true,
		path: resolve(process.cwd(), 'atolla/native/android/res/drawable-xxhdpi/ic_notification.png'),
		platform: 'android',
		size: 72,
	},
	{
		monochrome: true,
		noPadding: true,
		path: resolve(process.cwd(), 'atolla/native/android/res/drawable-xxxhdpi/ic_notification.png'),
		platform: 'android',
		size: 96,
	},
];

function resolveSelectedPlatforms(): Set<Platform> {
	const knownFlags = new Set(['--android', '--ios']);
	const args = process.argv.slice(2);

	for (const arg of args) {
		if (arg.startsWith('--') && !knownFlags.has(arg)) {
			console.warn(`warning: ignoring unrecognised flag '${arg}'`);
		}
	}

	const selected = new Set<Platform>();
	if (args.includes('--android')) selected.add('android');
	if (args.includes('--ios')) selected.add('ios');

	// No platform flag → generate everything (android + ios + web), preserving the
	// original behaviour so `bun run icons:generate` and existing callers are unaffected.
	if (selected.size === 0) {
		selected.add('android');
		selected.add('ios');
		selected.add('web');
	}

	return selected;
}

const selectedPlatforms = resolveSelectedPlatforms();
const selectedOutputs = outputs.filter((output) => selectedPlatforms.has(output.platform));

async function generateIcons(targets: Array<IconOutput>): Promise<void> {
	for (const output of targets) {
		console.log(`generating: ${output.path}`);
		await mkdir(dirname(output.path), { recursive: true });

		const isAndroidOutput = output.path.includes('/android/');
		const isIosOutput = output.path.includes('/AppIcon.appiconset/');
		const paddingRatio = isAndroidOutput
			? androidIconPaddingRatio
			: isIosOutput
				? iosIconPaddingRatio
				: defaultIconPaddingRatio;
		const padding = output.noPadding ? 0 : Math.round(output.size * paddingRatio);
		const contentSize = output.size - padding * 2;
		const fitMode = 'contain';

		const rendered = sharp(sourceSvgPath, { density: 512, limitInputPixels: false })
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
			.png({ compressionLevel: 9 });

		if (!output.monochrome) {
			await rendered.toFile(output.path);
			continue;
		}

		const renderedBuffer = await rendered.toBuffer();
		const alphaChannel = await sharp(renderedBuffer)
			.ensureAlpha()
			.extractChannel('alpha')
			.raw()
			.toBuffer({ resolveWithObject: true });

		await sharp({
			create: {
				background: { b: 255, g: 255, r: 255 },
				channels: 3,
				height: alphaChannel.info.height,
				width: alphaChannel.info.width,
			},
		})
			.joinChannel(alphaChannel.data, {
				raw: {
					channels: 1,
					height: alphaChannel.info.height,
					width: alphaChannel.info.width,
				},
			})
			.png({ compressionLevel: 9 })
			.toFile(output.path);
	}
}

async function validateIcons(targets: Array<IconOutput>): Promise<void> {
	await access(sourceSvgPath);

	const failures = (
		await Promise.all(
			targets.map(async (output) => {
				try {
					await access(output.path);
					const metadata = await sharp(output.path).metadata();
					if (metadata.width !== output.size || metadata.height !== output.size) {
						return `size mismatch: ${output.path} expected ${output.size}x${output.size} got ${metadata.width}x${metadata.height}`;
					}
					return null;
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					return `missing or unreadable: ${output.path} (${message})`;
				}
			}),
		)
	).filter((failure): failure is string => failure !== null);

	if (failures.length > 0) {
		throw new Error(`Icon validation failed:\n${failures.join('\n')}`);
	}
}

async function main(): Promise<void> {
	const platforms = [...selectedPlatforms].sort().join(', ');
	console.log(`Generating icons from atolla/res/logo.svg (${platforms})...`);
	await generateIcons(selectedOutputs);

	console.log('Validating generated icons...');
	await validateIcons(selectedOutputs);

	if (selectedPlatforms.has('ios')) {
		console.log('Copying svg to ios liquid glass directory...');
		copyFileSync(
			'atolla/res/logo.svg',
			'atolla/native/ios/Assets.xcassets/AppIcon.icon/Assets/logo.svg',
		);
	}

	console.log(`Icon generation/validation complete: ${selectedOutputs.length} files OK`);
}

await main();
