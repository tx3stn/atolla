import {
	cacheAtollaTrackFromUrlAsync,
	getAtollaCachedTrackFileUrl,
	setAtollaAudioPlaybackUpcomingQueue,
	setAtollaRetainedTrackIds,
} from '../TrackPlaybackNative';
import { NATIVE_CACHE_UNAUTHORIZED } from './NativeCacheResult';

export interface TrackSourceNative {
	cacheTrackFromUrl(
		trackId: string,
		url: string,
		accessToken: string,
		onComplete: (source: string | null) => void,
	): void;
	getCachedTrackFileUrl(trackId: string): string;
	setRetainedTrackIds(ids: Array<string>): void;
	setUpcomingQueue(payload: string): void;
}

export class TrackSourceNativeAdapter implements TrackSourceNative {
	constructor(private readonly onUnauthorized: () => void) {}

	cacheTrackFromUrl(
		trackId: string,
		url: string,
		accessToken: string,
		onComplete: (source: string | null) => void,
	): void {
		cacheAtollaTrackFromUrlAsync(trackId, url, accessToken, (source) => {
			if (source === NATIVE_CACHE_UNAUTHORIZED) {
				this.onUnauthorized();
				onComplete(null);
				return;
			}
			onComplete(source);
		});
	}

	getCachedTrackFileUrl(trackId: string): string {
		return getAtollaCachedTrackFileUrl(trackId);
	}

	setRetainedTrackIds(ids: Array<string>): void {
		setAtollaRetainedTrackIds(JSON.stringify(ids));
	}

	setUpcomingQueue(payload: string): void {
		setAtollaAudioPlaybackUpcomingQueue(payload);
	}
}
