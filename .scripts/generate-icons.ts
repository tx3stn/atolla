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
	src?: string;
};

const sourceSvgPath = resolve(process.cwd(), 'atolla/res/logo.svg');
// The local dev build (//:atolla_dev) is a separate app id so it can be installed
// alongside the released app; its icon swaps the waveform cutout for "DEV" so the
// two are distinguishable on the home screen. See atolla/res/logo-dev.svg.
const devSourceSvgPath = resolve(process.cwd(), 'atolla/res/logo-dev.svg');
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

// Dev-variant launcher icons for //:atolla_dev. Android keeps them in the same res/
// root under a distinct name (ic_launcher_dev) so no resource merge is needed; iOS
// gets its own asset catalog so the required "AppIcon" set name doesn't collide.
const devOutputs: Array<IconOutput> = [
	{
		path: resolve(process.cwd(), 'atolla/native/android/res/mipmap-mdpi/ic_launcher_dev.png'),
		platform: 'android',
		size: 48,
		src: devSourceSvgPath,
	},
	{
		path: resolve(process.cwd(), 'atolla/native/android/res/mipmap-hdpi/ic_launcher_dev.png'),
		platform: 'android',
		size: 72,
		src: devSourceSvgPath,
	},
	{
		path: resolve(process.cwd(), 'atolla/native/android/res/mipmap-xhdpi/ic_launcher_dev.png'),
		platform: 'android',
		size: 96,
		src: devSourceSvgPath,
	},
	{
		path: resolve(process.cwd(), 'atolla/native/android/res/mipmap-xxhdpi/ic_launcher_dev.png'),
		platform: 'android',
		size: 144,
		src: devSourceSvgPath,
	},
	{
		path: resolve(process.cwd(), 'atolla/native/android/res/mipmap-xxxhdpi/ic_launcher_dev.png'),
		platform: 'android',
		size: 192,
		src: devSourceSvgPath,
	},
	{
		path: resolve(
			process.cwd(),
			'atolla/native/android/res/drawable/ic_launcher_dev_foreground.png',
		),
		platform: 'android',
		size: 432,
		src: devSourceSvgPath,
	},
	{
		monochrome: true,
		path: resolve(
			process.cwd(),
			'atolla/native/android/res/drawable/ic_launcher_dev_monochrome.png',
		),
		platform: 'android',
		size: 432,
		src: devSourceSvgPath,
	},
	{
		path: resolve(
			process.cwd(),
			'atolla/native/ios/Assets-dev.xcassets/AppIcon.appiconset/icon-1024.png',
		),
		platform: 'ios',
		size: 1024,
		src: devSourceSvgPath,
	},
];

const args = process.argv.slice(2);
const knownFlags = new Set(['--android', '--ios', '--dev']);

for (const arg of args) {
	if (arg.startsWith('--') && !knownFlags.has(arg)) {
		console.warn(`warning: ignoring unrecognised flag '${arg}'`);
	}
}

const generateDev = args.includes('--dev');

function resolveSelectedPlatforms(): Set<Platform> {
	const selected = new Set<Platform>();
	if (args.includes('--android')) selected.add('android');
	if (args.includes('--ios')) selected.add('ios');

	// no platform flag generates everything, preserving behaviour for existing callers;
	// `--dev` on its own targets only the dev variant, so it doesn't default to all.
	if (selected.size === 0 && !generateDev) {
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

		const rendered = sharp(output.src ?? sourceSvgPath, { density: 512, limitInputPixels: false })
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

async function _validateIcons(targets: Array<IconOutput>): Promise<void> {
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
	const tasks = [...selectedOutputs];
	if (generateDev) tasks.push(...devOutputs);

	const labels: Array<string> = [...selectedPlatforms].sort();
	if (generateDev) labels.push('dev');
	console.log(`Generating icons (${labels.join(', ')})...`);
	await generateIcons(tasks);

	if (selectedPlatforms.has('ios')) {
		console.log('Copying svg to ios liquid glass directory...');
		const iosLiquidGlassSvg = 'atolla/native/ios/Assets.xcassets/AppIcon.icon/Assets/logo.svg';
		await mkdir(dirname(iosLiquidGlassSvg), { recursive: true });
		copyFileSync('atolla/res/logo.svg', iosLiquidGlassSvg);
	}

	console.log(`Icon generation complete: ${tasks.length} files OK`);
}

await main();
