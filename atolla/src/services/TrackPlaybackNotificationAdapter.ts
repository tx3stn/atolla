import {
	clearAtollaTrackPlaybackNotification,
	consumeAtollaTrackPlaybackNotificationAction,
	ensureAtollaTrackPlaybackNotificationPermission,
	updateAtollaTrackPlaybackNotification,
} from '../TrackPlaybackNative';
import type { TrackPlaybackNotificationPayload } from './TrackPlaybackNotificationSync';

export interface TrackPlaybackNotificationNative {
	clear(): void;
	consumeAction(): string;
	ensurePermission(): boolean;
	update(payload: TrackPlaybackNotificationPayload): void;
}

export class TrackPlaybackNotificationAdapter implements TrackPlaybackNotificationNative {
	consumeAction(): string {
		return consumeAtollaTrackPlaybackNotificationAction();
	}

	ensurePermission(): boolean {
		return ensureAtollaTrackPlaybackNotificationPermission();
	}

	clear(): void {
		clearAtollaTrackPlaybackNotification();
	}

	update(payload: TrackPlaybackNotificationPayload): void {
		updateAtollaTrackPlaybackNotification(
			payload.trackName,
			payload.artistName,
			payload.albumName,
			payload.artworkUrl,
			payload.isPlaying,
			payload.positionSeconds,
			payload.durationSeconds,
			payload.hasPrevious,
			payload.hasNext,
		);
	}
}
