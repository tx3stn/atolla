import {
	cacheAtollaTrackFromUrlAsync,
	getAtollaCachedTrackFileUrl,
	setAtollaAudioPlaybackUpcomingQueue,
} from '../TrackPlaybackNative';

export interface TrackSourceNative {
	cacheTrackFromUrl(
		trackId: string,
		url: string,
		accessToken: string,
		onComplete: (source: string | null) => void,
	): void;
	getCachedTrackFileUrl(trackId: string): string;
	setUpcomingQueue(payload: string): void;
}

export class TrackSourceNativeAdapter implements TrackSourceNative {
	cacheTrackFromUrl(
		trackId: string,
		url: string,
		accessToken: string,
		onComplete: (source: string | null) => void,
	): void {
		cacheAtollaTrackFromUrlAsync(trackId, url, accessToken, onComplete);
	}

	getCachedTrackFileUrl(trackId: string): string {
		return getAtollaCachedTrackFileUrl(trackId);
	}

	setUpcomingQueue(payload: string): void {
		setAtollaAudioPlaybackUpcomingQueue(payload);
	}
}
