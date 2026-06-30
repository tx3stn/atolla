import { AssetOutputType, addAssetLoadObserver } from 'valdi_core/src/Asset';
import { Device } from 'valdi_core/src/Device';
import { preloadAtollaImages } from '../ImageLoaderBootstrap';
import {
	getAtollaCachedTrackFileUrl,
	getAtollaDownloadedTrackFileUrl,
} from '../TrackPlaybackNative';
import type { ImageCategory } from './ImageCache';
import { buildImageSource } from './ImageSource';

const IMAGE_CACHE_RESOLVE_TIMEOUT_MS = 6000;

export class AssetCache {
	// resolvers waiting on the native "image cached" observer, keyed by category + stripped url
	private readonly pendingResolvers = new Map<string, Array<() => void>>();

	// ask the native loader to cache an image, resolving once it reports cached (a hit reports too, so
	// this resolves promptly either way).
	cacheImageAsset(url: string, category: ImageCategory): Promise<void> {
		return new Promise<void>((resolve) => {
			const key = this.fingerprint(url, category);
			let settled = false;
			let timer: ReturnType<typeof setTimeout> | undefined;

			const done = (): void => {
				if (settled) return;
				settled = true;
				if (timer) clearTimeout(timer);
				const list = this.pendingResolvers.get(key);
				if (list) {
					const index = list.indexOf(done);
					if (index >= 0) list.splice(index, 1);
					if (list.length === 0) this.pendingResolvers.delete(key);
				}
				resolve();
			};

			const list = this.pendingResolvers.get(key) ?? [];
			list.push(done);
			this.pendingResolvers.set(key, list);

			try {
				preloadAtollaImages([url], category);
			} catch {
				// no native preload bridge here: treat as done.
				done();
				return;
			}

			timer = setTimeout(done, IMAGE_CACHE_RESOLVE_TIMEOUT_MS);
		});
	}

	getAudioPathForWaveform(trackId: string): string | null {
		try {
			const cached = getAtollaCachedTrackFileUrl(trackId);
			if (cached) return cached;
		} catch {}
		try {
			const downloaded = getAtollaDownloadedTrackFileUrl(trackId);
			if (downloaded) return downloaded;
		} catch {}
		return null;
	}

	prewarmNowPlayingArtwork(imageUrl: string): void {
		const outputType = Device.isAndroid()
			? AssetOutputType.IMAGE_ANDROID
			: AssetOutputType.IMAGE_IOS;
		const sources = [
			buildImageSource(imageUrl, 'album_art'),
			buildImageSource(imageUrl, 'album_art_blurred'),
		];
		for (const source of sources) {
			let subscription: { unsubscribe(): void } | undefined;
			subscription = addAssetLoadObserver(
				source,
				() => {
					subscription?.unsubscribe();
				},
				outputType,
			);
		}
	}

	// resolve any cacheImageAsset waiters for an image the native loader just cached
	resolveCachedImageWaiters(url: string, category: string): void {
		const key = this.fingerprint(url, category);
		const resolvers = this.pendingResolvers.get(key);
		if (!resolvers || resolvers.length === 0) return;
		for (const resolve of [...resolvers]) {
			resolve();
		}
	}

	// match a cache request against the native observer: the requested url carries api_key while the
	// observer reports a stripped url and query encoding can differ, so key on the stable parts only
	private fingerprint(url: string, category: string): string {
		try {
			const parsed = new URL(url);
			const tag = parsed.searchParams.get('tag') ?? '';
			return `${category}\n${parsed.origin}${parsed.pathname}\n${tag}`;
		} catch {
			return `${category}\n${url}`;
		}
	}
}
