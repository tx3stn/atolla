import type { Track } from '../models/Track';
import type { PlaybackStore } from '../stores/Playback';
import { RECENTLY_PLAYED_LIMIT, type RecentlyPlayedStore } from '../stores/RecentlyPlayed';
import { fireAndForget } from '../utils/Async';
import type { ScrobbleService } from './ScrobbleService';
import type { TrackPlaybackNotificationNative } from './TrackPlaybackNotificationAdapter';
import {
	applyTrackPlaybackNotificationAction,
	buildTrackPlaybackNotificationPayload,
	normalizeTrackPlaybackNotificationAction,
} from './TrackPlaybackNotificationSync';
import type { WaveformRenderCache } from './WaveformRenderCache';
import type { WaveformService } from './WaveformService';

const NATIVE_ACTION_POLL_INTERVAL_MS = 350;

export interface NowPlayingPaletteService {
	hasPalette(imageUrl: string | null | undefined): boolean;
	warmUp(imageUrls: Array<string>): Promise<void>;
}

export interface NowPlayingPaletteQueue {
	prioritize(imageUrl: string | null | undefined): void;
}

export interface PlaybackOrchestratorDeps {
	getAudioFileUrl: (trackId: string) => string | null;
	notification: TrackPlaybackNotificationNative;
	onPlaybackTick: () => void;
	playbackStore: PlaybackStore;
	prewarmArtwork: (imageUrl: string) => void;
	requestOverlayRerender: () => void;
	// force a host re-render after async work resolves (e.g. recently-played restore)
	requestRerender: () => void;
	resolveArtistLogoUrl: (artistId: string) => Promise<string | null>;
}

export interface PlaybackUserServices {
	disposeWaveformQueue: () => void;
	enqueueWaveform: (trackId: string, audioPath: string) => void;
	paletteQueue: NowPlayingPaletteQueue;
	paletteService: NowPlayingPaletteService;
	recentlyPlayed: RecentlyPlayedStore;
	reorderWaveformQueue: (trackIds: Array<string>) => void;
	scrobble: ScrobbleService;
	waveformRenderCache: WaveformRenderCache;
	waveformService: WaveformService;
}

// owns the side-effects driven by playback state that are not the audio source itself: scrobble
// snapshots and recently-played history. driven by the host's playback subscription and lifecycle
// so that machinery lives outside the component.
export class PlaybackOrchestrator {
	private readonly playbackStore: PlaybackStore;
	private readonly notification: TrackPlaybackNotificationNative;
	private readonly getAudioFileUrl: (trackId: string) => string | null;
	private readonly onPlaybackTick: () => void;
	private readonly prewarmArtwork: (imageUrl: string) => void;
	private readonly resolveArtistLogoUrl: (artistId: string) => Promise<string | null>;
	private readonly requestRerender: () => void;
	private readonly requestOverlayRerender: () => void;

	private recentlyPlayedStore?: RecentlyPlayedStore;
	private scrobbleService?: ScrobbleService;
	private paletteService?: NowPlayingPaletteService;
	private paletteQueue?: NowPlayingPaletteQueue;
	private lastArtworkUrl: string | null = null;
	private resolvingArtistLogoId: string | null = null;
	private waveformService?: WaveformService;
	private waveformRenderCache?: WaveformRenderCache;
	private enqueueWaveform?: (trackId: string, audioPath: string) => void;
	private reorderWaveformQueue?: (trackIds: Array<string>) => void;
	private disposeWaveformQueue?: () => void;
	private unsubscribeWaveform?: () => void;
	private unsubscribeWaveformRender?: () => void;
	private lastWaveformPriorityTracksRef: Array<Track> | null = null;
	private lastWaveformPriorityTrackIndex = -1;
	private recentlyPlayedTracks: Array<Track> = [];
	private lastObservedRecentTrackId: string | null = null;
	private recentlyPlayedRestoring = false;
	// bumped on every (re)bind so a slow restore from a superseded user can't overwrite the current one
	private restoreGeneration = 0;
	private destroyed = false;
	private lastTrackNotificationStateKey = '';
	private lastTrackNotificationPositionBucket = -1;
	private actionPollInterval?: ReturnType<typeof setInterval>;
	private unsubscribePlayback?: () => void;
	private lastPlaybackSignature = '';
	private lastPlaybackTickAt = 0;

	constructor(deps: PlaybackOrchestratorDeps) {
		this.playbackStore = deps.playbackStore;
		this.notification = deps.notification;
		this.getAudioFileUrl = deps.getAudioFileUrl;
		this.onPlaybackTick = deps.onPlaybackTick;
		this.prewarmArtwork = deps.prewarmArtwork;
		this.resolveArtistLogoUrl = deps.resolveArtistLogoUrl;
		this.requestRerender = deps.requestRerender;
		this.requestOverlayRerender = deps.requestOverlayRerender;
	}

	// begin draining the native notification action queue. owned here, not the host, so the whole
	// notification concern lives in one place; the interval is cleared in dispose().
	start(): void {
		if (!this.actionPollInterval) {
			this.actionPollInterval = setInterval(() => {
				this.consumeNotificationAction();
			}, NATIVE_ACTION_POLL_INTERVAL_MS);
		}
		if (!this.unsubscribePlayback) {
			this.unsubscribePlayback = this.playbackStore.subscribe(() => this.handlePlaybackTick());
			this.syncTrackPlaybackNotification();
		}
	}

	private handlePlaybackTick(): void {
		this.syncScrobblePlaybackSnapshot();
		this.syncTrackPlaybackNotification();

		const now = Date.now();
		if (this.lastPlaybackTickAt > 0 && now - this.lastPlaybackTickAt > 1000) {
			this.lastPlaybackSignature = '';
		}
		this.lastPlaybackTickAt = now;

		const { track, trackIndex, tracks, album, isPlaying, loopMode } = this.playbackStore;
		const sig = `${track?.id ?? ''}|${trackIndex}|${tracks.length}|${album?.id ?? ''}|${isPlaying}|${loopMode}`;
		if (sig === this.lastPlaybackSignature) {
			return;
		}
		this.lastPlaybackSignature = sig;

		this.onPlaybackTick();
	}

	dispose(): void {
		this.destroyed = true;
		if (this.unsubscribePlayback) {
			this.unsubscribePlayback();
			this.unsubscribePlayback = undefined;
		}
		if (this.actionPollInterval) {
			clearInterval(this.actionPollInterval);
			this.actionPollInterval = undefined;
		}
		this.teardownWaveform();
		if (!this.playbackStore.track) {
			this.notification.clear();
		}
	}

	private teardownWaveform(): void {
		if (this.unsubscribeWaveform) {
			this.unsubscribeWaveform();
			this.unsubscribeWaveform = undefined;
		}
		if (this.unsubscribeWaveformRender) {
			this.unsubscribeWaveformRender();
			this.unsubscribeWaveformRender = undefined;
		}
		this.disposeWaveformQueue?.();
		if (this.waveformRenderCache) {
			this.waveformRenderCache.clear();
		}
	}

	consumeNotificationAction(): void {
		const action = normalizeTrackPlaybackNotificationAction(this.notification.consumeAction());
		if (action === null) {
			return;
		}

		applyTrackPlaybackNotificationAction(this.playbackStore, action);
	}

	syncTrackPlaybackNotification(): void {
		const payload = buildTrackPlaybackNotificationPayload(this.playbackStore);
		if (!payload) {
			this.lastTrackNotificationStateKey = '';
			this.lastTrackNotificationPositionBucket = -1;
			this.notification.clear();
			return;
		}

		if (
			payload.stateKey === this.lastTrackNotificationStateKey &&
			payload.positionBucket === this.lastTrackNotificationPositionBucket
		) {
			return;
		}

		this.lastTrackNotificationStateKey = payload.stateKey;
		this.lastTrackNotificationPositionBucket = payload.positionBucket;

		if (!this.notification.ensurePermission()) {
			return;
		}

		this.notification.update(payload);
	}

	// (re)bind the user-scoped stores/services. called on bootstrap and whenever the signed-in
	// user changes, mirroring the host's initUserStores.
	setUserServices(services: PlaybackUserServices): void {
		this.recentlyPlayedStore = services.recentlyPlayed;
		this.scrobbleService = services.scrobble;
		this.paletteService = services.paletteService;
		this.paletteQueue = services.paletteQueue;
		fireAndForget('scrobbleAppReady', this.scrobbleService.onAppReady());
		this.recentlyPlayedRestoring = true;
		this.recentlyPlayedTracks = [];
		this.lastObservedRecentTrackId = null;
		this.restoreGeneration += 1;
		fireAndForget('restoreRecentlyPlayed', this.restoreRecentlyPlayed(this.restoreGeneration));
		this.syncScrobblePlaybackSnapshot();

		this.teardownWaveform();
		this.waveformService = services.waveformService;
		this.waveformRenderCache = services.waveformRenderCache;
		this.enqueueWaveform = services.enqueueWaveform;
		this.reorderWaveformQueue = services.reorderWaveformQueue;
		this.disposeWaveformQueue = services.disposeWaveformQueue;
		this.lastWaveformPriorityTracksRef = null;
		this.lastWaveformPriorityTrackIndex = -1;
		fireAndForget('waveformWarmUp', this.waveformService.warmUp());
		this.unsubscribeWaveform = this.waveformService.subscribe(this.requestOverlayRerender);
		this.unsubscribeWaveformRender = this.waveformRenderCache.subscribe(
			this.requestOverlayRerender,
		);
	}

	getRecentlyPlayedTracks(): Array<Track> {
		return this.recentlyPlayedTracks;
	}

	clearRecentlyPlayed(): void {
		this.recentlyPlayedTracks = [];
		this.lastObservedRecentTrackId = null;
		// cancel any in-flight restore so a late load() can't resurrect the cleared history, and
		// re-enable persistence since the superseded restore now bails before clearing the flag
		this.restoreGeneration += 1;
		this.recentlyPlayedRestoring = false;
	}

	getRecentlyPlayedRaw(): Promise<string | undefined> {
		return this.recentlyPlayedStore
			? this.recentlyPlayedStore.loadRaw()
			: Promise.resolve(undefined);
	}

	getPendingScrobbleCount(): number | undefined {
		return this.scrobbleService?.getPendingScrobbles().length;
	}

	notifyAppReady(): void {
		if (this.scrobbleService) {
			fireAndForget('scrobbleAppReady', this.scrobbleService.onAppReady());
		}
	}

	handleAlbumChange(): void {
		const paletteService = this.paletteService;
		const paletteQueue = this.paletteQueue;
		if (!paletteService || !paletteQueue) {
			return;
		}
		const imageUrl =
			this.playbackStore.track?.albumImageUrl ?? this.playbackStore.album?.imageUrl ?? null;
		if (!imageUrl || imageUrl === this.lastArtworkUrl) {
			return;
		}
		this.lastArtworkUrl = imageUrl;
		this.prewarmArtwork(imageUrl);
		fireAndForget(
			'paletteWarmUp',
			paletteService.warmUp([imageUrl]).then(() => {
				if (!paletteService.hasPalette(imageUrl)) {
					paletteQueue.prioritize(imageUrl);
				}
			}),
		);
	}

	resolveCurrentArtistLogo(): void {
		const artistId = this.playbackStore.unresolvedArtistLogoArtistId;
		if (!artistId || this.resolvingArtistLogoId === artistId) {
			return;
		}
		this.resolvingArtistLogoId = artistId;
		void this.resolveArtistLogoUrl(artistId)
			.then((logoUrl) => {
				this.resolvingArtistLogoId = null;
				if (!logoUrl) {
					return;
				}
				if (this.playbackStore.unresolvedArtistLogoArtistId !== artistId) {
					return;
				}
				this.playbackStore.setArtistLogoUrl(logoUrl);
				this.requestOverlayRerender();
			})
			.catch(() => {
				this.resolvingArtistLogoId = null;
			});
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
			fireAndForget('recentlyPlayedSave', this.recentlyPlayedStore.save(this.recentlyPlayedTracks));
		}
	}

	handleWaveformPriority(): void {
		if (
			!this.waveformService ||
			!this.enqueueWaveform ||
			!this.reorderWaveformQueue ||
			this.playbackStore.tracks.length === 0
		)
			return;

		if (
			this.playbackStore.tracks === this.lastWaveformPriorityTracksRef &&
			this.playbackStore.trackIndex === this.lastWaveformPriorityTrackIndex
		) {
			return;
		}
		this.lastWaveformPriorityTracksRef = this.playbackStore.tracks;
		this.lastWaveformPriorityTrackIndex = this.playbackStore.trackIndex;

		for (const track of this.playbackStore.tracks) {
			const audioPath = this.getAudioFileUrl(track.id);
			if (audioPath) {
				this.scheduleAndEnqueueWaveform(track.id, audioPath);
			}
		}
		this.reorderWaveformQueue(this.getPlaybackTrackIds());
	}

	enqueueWaveformIfNeeded(trackId: string, audioPath: string): void {
		if (!this.waveformService || !this.enqueueWaveform || !this.reorderWaveformQueue) return;
		this.scheduleAndEnqueueWaveform(trackId, audioPath);
		this.reorderWaveformQueue(this.getPlaybackTrackIds());
	}

	private scheduleAndEnqueueWaveform(trackId: string, audioPath: string): void {
		this.waveformService?.scheduleGeneration(trackId);
		this.enqueueWaveform?.(trackId, audioPath);
	}

	getWaveformMaskUrl(trackId: string): string | null {
		if (!this.waveformService || !this.waveformRenderCache) return null;
		const amps = this.waveformService.getAmps(trackId);
		if (!amps) return null;
		return this.waveformRenderCache.getOrRequest(trackId, amps);
	}

	getWaveformReadyCount(): number {
		return this.waveformService?.getReadyCount() ?? 0;
	}

	clearWaveformData(): void {
		this.waveformService?.clearAll();
		this.waveformRenderCache?.clear();
	}

	private getPlaybackTrackIds(): Array<string> {
		const { tracks, trackIndex } = this.playbackStore;
		const ids: Array<string> = [];
		for (let i = trackIndex; i < tracks.length; i++) ids.push(tracks[i].id);
		for (let i = 0; i < trackIndex; i++) ids.push(tracks[i].id);
		return ids;
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
		// tracks captured during the load window are newer than the persisted list; keep them in
		// front and dedupe the persisted entries behind them rather than overwriting them
		const captured = this.recentlyPlayedTracks;
		this.recentlyPlayedTracks = [
			...captured,
			...tracks.filter((track) => !captured.some((existing) => existing.id === track.id)),
		].slice(0, RECENTLY_PLAYED_LIMIT);
		this.recentlyPlayedRestoring = false;
		if (captured.length > 0) {
			// captures were held back from persistence while restoring; flush the merged list
			fireAndForget('recentlyPlayedRestoreSave', store.save(this.recentlyPlayedTracks));
		} else {
			// nothing played during the load window: surface the active track as before
			this.lastObservedRecentTrackId = null;
			this.captureRecentlyPlayedTrack();
		}
		this.requestRerender();
	}
}
