import {
	cacheAtollaTrackFromUrlAsync,
	getAtollaCachedTrackFileUrl,
	setAtollaAudioPlaybackUpcomingQueue,
	setAtollaRetainedTrackIds,
} from '../TrackPlaybackNative';

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

	setRetainedTrackIds(ids: Array<string>): void {
		setAtollaRetainedTrackIds(JSON.stringify(ids));
	}

	setUpcomingQueue(payload: string): void {
		setAtollaAudioPlaybackUpcomingQueue(payload);
	}
}
