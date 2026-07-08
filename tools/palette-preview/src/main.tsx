// headless renderer for palette tuning. reads a manifest of artwork + extracted-palette + track
// entries and renders the real NowPlayingSurface (expanded) to a PNG through SnapDrawing/Skia, so a
// palette tweak can be eyeballed on the actual UI. run via the
// //tools/palette-preview:palette_preview_cli bazel binary with --manifest <path> (driven by ../run.ts).
import type { Album } from 'atolla/src/models/Album';
import type { Palette } from 'atolla/src/models/Color';
import type { Track } from 'atolla/src/models/Track';
import type { ImageCache } from 'atolla/src/services/ImageCache';
import { ToastService } from 'atolla/src/services/ToastService';
import { BarColorStore } from 'atolla/src/stores/BarColor';
import type { PlaybackStore } from 'atolla/src/stores/Playback';
import type { Transport } from 'atolla/src/transports/Transport';
import {
	NowPlayingSurface,
	type NowPlayingSurfaceViewModel,
} from 'atolla/src/ui/components/NowPlayingSurface';
import { createBitmap } from 'drawing/src/BitmapFactory';
import { BitmapAlphaType, BitmapColorType, ImageEncoding } from 'drawing/src/IBitmap';
import { createManagedContext } from 'drawing/src/ManagedContextFactory';
import { fs } from 'file_system/src/FileSystem';
import { makeAssetFromBytes } from 'valdi_core/src/Asset';
import { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { beginKeepAlive, endKeepAlive } from 'valdi_core/src/utils/KeepAliveCallback';
import { onIdleInterruptible } from 'valdi_core/src/utils/OnIdle';
import { ArgumentsParser } from 'valdi_standalone/src/ArgumentsParser';
import { getStandaloneRuntime } from 'valdi_standalone/src/ValdiStandalone';
import type { Asset } from 'valdi_tsx/src/Asset';

interface ManifestPalette {
	accent: string;
	muted_on_surface: string;
	on_surface: string;
	surface: string;
}

interface ManifestTrack {
	albumName?: string;
	artistName: string;
	duration: number;
	name: string;
	productionYear?: number;
	releaseDate?: string;
}

interface ManifestEntry {
	artworkPath: string;
	blurredPath?: string;
	height: number;
	outPath: string;
	palette: ManifestPalette;
	track: ManifestTrack;
	width: number;
}

// capture the mounted instance so we can drive it into the expanded state after layout. matches the
// pattern used by the component spec (onViewModelUpdate fires on first mount).
let capturedSurface: NowPlayingSurface | undefined;

class CapturingNowPlayingSurface extends NowPlayingSurface {
	onViewModelUpdate(previousViewModel: NowPlayingSurfaceViewModel): void {
		capturedSurface = this;
		super.onViewModelUpdate(previousViewModel);
	}
}

function waitForIdle(): Promise<void> {
	return new Promise((resolve) => {
		onIdleInterruptible(resolve);
	});
}

function mockPlaybackStore(duration: number): PlaybackStore {
	return {
		cycleLoopMode: () => {},
		jumpToIndex: () => {},
		next: () => {},
		playPause: () => {},
		previousOrRestart: () => {},
		progressSeconds: Math.floor(duration * 0.38),
		seekTo: () => {},
		skipForward: () => {},
		stop: () => {},
		subscribe: () => () => {},
		track: { duration },
	} as unknown as PlaybackStore;
}

function buildViewModel(
	entry: ManifestEntry,
	artwork: Asset,
	blurred: Asset,
): NowPlayingSurfaceViewModel {
	const track = {
		albumName: entry.track.albumName,
		artistName: entry.track.artistName,
		duration: entry.track.duration,
		id: 'preview-track',
		name: entry.track.name,
		productionYear: entry.track.productionYear,
		releaseDate: entry.track.releaseDate,
	} as unknown as Track;

	const album = {
		artistId: 'preview-artist',
		artistName: entry.track.artistName,
		id: 'preview-album',
		imageUrl: 'preview://artwork',
		name: entry.track.albumName ?? '',
		releaseDate: entry.track.releaseDate ?? '',
	} as unknown as Album;

	const palette: Palette = {
		accent: { hex: entry.palette.accent },
		muted_on_surface: { hex: entry.palette.muted_on_surface },
		on_surface: { hex: entry.palette.on_surface },
		surface: { hex: entry.palette.surface },
	};

	return {
		album,
		albumArtworkSource: artwork,
		animationsEnabled: false,
		artistLogoUrl: null,
		barColors: new BarColorStore(),
		blurredArtworkSource: blurred,
		collapseSignal: 0,
		gridColumns: 2,
		imageCache: {} as unknown as ImageCache,
		isPlaying: true,
		modalSlot: new DetachedSlot(),
		palette,
		playbackStore: mockPlaybackStore(entry.track.duration),
		toastService: new ToastService(),
		track,
		trackIndex: 0,
		tracks: [track],
		transport: { getArtistLogoUrl: () => Promise.resolve(null) } as unknown as Transport,
		waveformMaskUrl: undefined,
	};
}

async function renderExpandedSurface(entry: ManifestEntry): Promise<void> {
	const artwork = makeAssetFromBytes(fs.readFileSync(entry.artworkPath) as ArrayBuffer);
	const blurred = entry.blurredPath
		? makeAssetFromBytes(fs.readFileSync(entry.blurredPath) as ArrayBuffer)
		: artwork;
	const viewModel = buildViewModel(entry, artwork, blurred);

	const context = createManagedContext();
	try {
		capturedSurface = undefined;
		context.render(() => {
			<CapturingNowPlayingSurface {...viewModel} />;
		});
		await context.layout(entry.width, entry.height, false);

		// drive the surface open. with animationsEnabled=false the open animation applies its
		// end-state synchronously and settleExpanded() runs on the promise chain's microtasks, so a
		// few microtask turns are enough to settle before we re-layout the expanded geometry.
		(capturedSurface as unknown as { openSurface: () => void } | undefined)?.openSurface();
		for (let i = 0; i < 5; i++) {
			await Promise.resolve();
		}

		await context.layout(entry.width, entry.height, false);
		await waitForIdle();
		await context.onAllAssetsLoaded();

		const { frame } = await context.draw();
		const bitmap = createBitmap({
			alphaType: BitmapAlphaType.Premul,
			colorType: BitmapColorType.RGBA8888,
			height: entry.height,
			rowBytes: entry.width * 4,
			width: entry.width,
		});
		frame.rasterInto(bitmap, true);
		const png = bitmap.encode(ImageEncoding.PNG, 1.0);

		const dir = entry.outPath.substring(0, entry.outPath.lastIndexOf('/'));
		if (dir) {
			try {
				fs.createDirectorySync(dir, true);
			} catch {
				// directory already exists
			}
		}
		fs.writeFileSync(entry.outPath, png);

		frame.dispose();
		bitmap.dispose();
	} finally {
		context.dispose();
	}
}

const standalone = getStandaloneRuntime();
const programArguments = standalone.arguments.slice();
programArguments.shift();

const parser = new ArgumentsParser('nowplaying_shot', ['_', ...programArguments]);
const manifestArg = parser.addString('--manifest', 'Path to the render manifest JSON', true);
parser.parse();

const manifestPath = manifestArg.value;
if (!manifestPath) {
	throw new Error('--manifest is required');
}

const manifest = JSON.parse(
	fs.readFileSync(manifestPath, { encoding: 'utf8' }) as string,
) as Array<ManifestEntry>;

const keepAlive = beginKeepAlive();
(async () => {
	for (const entry of manifest) {
		console.info(`Rendering ${entry.outPath} (${entry.width}x${entry.height})...`);
		await renderExpandedSurface(entry);
	}
})()
	.then(() => {
		endKeepAlive(keepAlive);
		standalone.exit(0);
	})
	.catch((err) => {
		console.error(err);
		endKeepAlive(keepAlive);
		standalone.exit(1);
	});
