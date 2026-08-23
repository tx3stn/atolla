import type { ImageCategory } from 'atolla_core/src/services/ImageCache';
import { buildImageSource, imageCacheKey } from 'atolla_core/src/services/ImageSource';
import { AssetOutputType, addAssetLoadObserver } from 'valdi_core/src/Asset';
import { Device } from 'valdi_core/src/Device';
import { preloadAtollaImages } from '../ImageLoaderBootstrap';
import {
	getAtollaCachedTrackFileUrl,
	getAtollaDownloadedTrackFileUrl,
} from '../TrackPlaybackNative';

const IMAGE_CACHE_RESOLVE_TIMEOUT_MS = 6000;

export class AssetCache {
	// resolvers waiting on the native "image cached" observer, keyed the same way the cache is
	private readonly pendingResolvers = new Map<string, Array<() => void>>();

	// ask the native loader to cache an image, resolving once it reports cached (a hit reports too, so
	// this resolves promptly either way).
	cacheImageAsset(id: string, url: string, category: ImageCategory): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const key = imageCacheKey(id, category);
			let settled = false;
			let timer: ReturnType<typeof setTimeout> | undefined;

			const settle = (cached: boolean): void => {
				if (settled) return;
				settled = true;
				if (timer) clearTimeout(timer);
				const list = this.pendingResolvers.get(key);
				if (list) {
					const index = list.indexOf(done);
					if (index >= 0) list.splice(index, 1);
					if (list.length === 0) this.pendingResolvers.delete(key);
				}
				if (cached) {
					resolve();
					return;
				}
				// the loader never reported this cached, so the caller must not record it as such
				reject(new Error(`Timed out caching ${key}`));
			};

			const done = (): void => settle(true);

			const list = this.pendingResolvers.get(key) ?? [];
			list.push(done);
			this.pendingResolvers.set(key, list);

			try {
				preloadAtollaImages([buildImageSource({ category, id, url })]);
			} catch {
				// no native preload bridge here: treat as done.
				done();
				return;
			}

			timer = setTimeout(() => settle(false), IMAGE_CACHE_RESOLVE_TIMEOUT_MS);
		});
	}

	getAudioPathForWaveform(trackId: string): string | null {
		try {
			const cached = getAtollaCachedTrackFileUrl(trackId);
			if (cached && !cached.endsWith('.tmp')) return cached;
		} catch {}
		try {
			const downloaded = getAtollaDownloadedTrackFileUrl(trackId);
			if (downloaded) return downloaded;
		} catch {}
		return null;
	}

	prewarmNowPlayingArtwork(id: string, imageUrl: string): void {
		const outputType = Device.isAndroid()
			? AssetOutputType.IMAGE_ANDROID
			: AssetOutputType.IMAGE_IOS;
		const sources = [
			buildImageSource({ category: 'album_art', id, url: imageUrl }),
			buildImageSource({ category: 'album_art_blurred', id, url: imageUrl }),
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
	resolveCachedImageWaiters(identity: string, category: ImageCategory): void {
		const resolvers = this.pendingResolvers.get(imageCacheKey(identity, category));
		if (!resolvers || resolvers.length === 0) return;
		for (const resolve of [...resolvers]) {
			resolve();
		}
	}
}
