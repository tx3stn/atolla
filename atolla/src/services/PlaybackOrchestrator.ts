import type { Track } from '../models/Track';
import type { PlaybackStore } from '../stores/Playback';
import { RECENTLY_PLAYED_LIMIT, type RecentlyPlayedStore } from '../stores/RecentlyPlayed';
import type { ScrobbleService } from './ScrobbleService';

export interface PlaybackOrchestratorDeps {
	playbackStore: PlaybackStore;
	// force a host re-render after async work resolves (e.g. recently-played restore)
	requestRerender: () => void;
}

// the user-scoped stores/services, constructed by the host (which owns the persistence module)
// and handed in on bootstrap / user change, mirroring how PlaybackStore is injected.
export interface PlaybackUserServices {
	recentlyPlayed: RecentlyPlayedStore;
	scrobble: ScrobbleService;
}

// owns the side-effects driven by playback state that are not the audio source itself: scrobble
// snapshots and recently-played history. driven by the host's playback subscription and lifecycle
// so that machinery lives outside the component.
export class PlaybackOrchestrator {
	private readonly playbackStore: PlaybackStore;
	private readonly requestRerender: () => void;

	private recentlyPlayedStore?: RecentlyPlayedStore;
	private scrobbleService?: ScrobbleService;
	private recentlyPlayedTracks: Array<Track> = [];
	private lastObservedRecentTrackId: string | null = null;
	private recentlyPlayedRestoring = false;
	// bumped on every (re)bind so a slow restore from a superseded user can't overwrite the current one
	private restoreGeneration = 0;
	private destroyed = false;

	constructor(deps: PlaybackOrchestratorDeps) {
		this.playbackStore = deps.playbackStore;
		this.requestRerender = deps.requestRerender;
	}

	dispose(): void {
		this.destroyed = true;
	}

	// (re)bind the user-scoped stores/services. called on bootstrap and whenever the signed-in
	// user changes, mirroring the host's initUserStores.
	setUserServices(services: PlaybackUserServices): void {
		this.recentlyPlayedStore = services.recentlyPlayed;
		this.scrobbleService = services.scrobble;
		this.recentlyPlayedRestoring = true;
		this.recentlyPlayedTracks = [];
		this.lastObservedRecentTrackId = null;
		this.restoreGeneration += 1;
		void this.restoreRecentlyPlayed(this.restoreGeneration);
		this.syncScrobblePlaybackSnapshot();
	}

	getRecentlyPlayedTracks(): Array<Track> {
		return this.recentlyPlayedTracks;
	}

	clearRecentlyPlayed(): void {
		this.recentlyPlayedTracks = [];
		this.lastObservedRecentTrackId = null;
	}

	syncScrobblePlaybackSnapshot(): void {
		if (!this.scrobbleService) {
			return;
		}

		const activeTrack = this.playbackStore.track;
		this.scrobbleService.observePlayback({
			hasSeekTarget: this.playbackStore.seekTarget != null,
			isPlaying: this.playbackStore.isPlaying,
			progressSeconds: this.playbackStore.progressSeconds,
			trackDurationSeconds: activeTrack?.duration ?? 0,
			trackId: activeTrack?.id ?? null,
		});
	}

	captureRecentlyPlayedTrack(): void {
		const activeTrack = this.playbackStore.track;
		if (!activeTrack) {
			this.lastObservedRecentTrackId = null;
			return;
		}

		if (activeTrack.id === this.lastObservedRecentTrackId) {
			return;
		}

		this.lastObservedRecentTrackId = activeTrack.id;
		this.recentlyPlayedTracks = [
			activeTrack,
			...this.recentlyPlayedTracks.filter((track) => track.id !== activeTrack.id),
		].slice(0, RECENTLY_PLAYED_LIMIT);
		if (!this.recentlyPlayedRestoring && this.recentlyPlayedStore) {
			void this.recentlyPlayedStore.save(this.recentlyPlayedTracks);
		}
	}

	private async restoreRecentlyPlayed(generation: number): Promise<void> {
		const store = this.recentlyPlayedStore;
		if (!store) {
			return;
		}

		const tracks = await store.load();
		if (this.destroyed || generation !== this.restoreGeneration) {
			return;
		}
		this.recentlyPlayedTracks = tracks;
		this.recentlyPlayedRestoring = false;
		this.lastObservedRecentTrackId = null;
		this.captureRecentlyPlayedTrack();
		this.requestRerender();
	}
}
