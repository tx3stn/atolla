import type { Track } from '../models/Track';
import type { PlaybackStore } from '../stores/Playback';
import { RECENTLY_PLAYED_LIMIT, type RecentlyPlayedStore } from '../stores/RecentlyPlayed';
import { fireAndForget } from '../utils/Async';
import { DeferredPlaybackDownloadCoordinator } from './DeferredPlaybackDownloadCoordinator';
import type { ScrobbleService } from './ScrobbleService';
import { TrackPlaybackNativePrefetchQueue } from './TrackPlaybackNativePrefetchQueue';
import type { TrackPlaybackNotificationNative } from './TrackPlaybackNotificationAdapter';
import {
	applyTrackPlaybackNotificationAction,
	buildTrackPlaybackNotificationPayload,
	normalizeTrackPlaybackNotificationAction,
} from './TrackPlaybackNotificationSync';
import {
	buildPlaybackQueueWindow,
	buildRetainedTrackIds,
	retainedForwardCount,
	serializeQueueWindow,
} from './TrackPlaybackUpcomingQueue';
import type { TrackSourceNative } from './TrackSourceNativeAdapter';
import type { WaveformRenderCache } from './WaveformRenderCache';
import type { WaveformService } from './WaveformService';

const NATIVE_ACTION_POLL_INTERVAL_MS = 350;
const UPCOMING_PALETTE_PREWARM_COUNT = 10;
const UPCOMING_PALETTE_CACHE_CONCURRENCY = 2;
// waveform generation opens a MediaCodec per track; pre-generate only a small window from the current
// track rather than the whole queue so the codec pool isn't exhausted. the window slides forward as
// tracks advance, and the generation queue abandons superseded jobs when the user skips
export const WAVEFORM_PREGEN_WINDOW = 2;

export interface DownloadedTrackSource {
	getTrackPlaybackUrl(trackId: string): string;
	isTrackDownloaded(trackId: string): boolean;
}

export interface NowPlayingPaletteService {
	hasPalette(imageUrl: string | null | undefined): boolean;
	warmUp(imageUrls: Array<string>): Promise<void>;
}

export interface NowPlayingPaletteQueue {
	enqueue(imageUrl: string | null | undefined): void;
	prioritize(imageUrl: string | null | undefined): void;
}

export interface PlaybackOrchestratorDeps {
	cacheAlbumArt: (imageUrl: string) => Promise<void>;
	downloads: DownloadedTrackSource;
	getAccessToken: () => string;
	getAudioFileUrl: (trackId: string) => string | null;
	getTrackCacheMaxTracks: () => number;
	getTrackCacheUrl: (trackId: string) => string | null;
	getTransportToken: () => unknown;
	isOfflinePlaybackMode: () => boolean;
	notification: TrackPlaybackNotificationNative;
	onPlaybackTick: () => void;
	playbackStore: PlaybackStore;
	prewarmArtwork: (imageUrl: string) => void;
	refreshTrackCachedCount: () => void;
	requestOverlayRerender: () => void;
	// force a host re-render after async work resolves (e.g. recently-played restore)
	requestRerender: () => void;
	resolveArtistLogoUrl: (artistId: string) => Promise<string | null>;
	showPlaybackToast: (message: string) => void;
	trackSourceNative: TrackSourceNative;
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
	private readonly getAccessToken: () => string;
	private readonly downloads: DownloadedTrackSource;
	private readonly getTrackCacheMaxTracks: () => number;
	private readonly getTrackCacheUrl: (trackId: string) => string | null;
	private readonly getTransportToken: () => unknown;
	private readonly isOfflinePlaybackMode: () => boolean;
	private readonly onPlaybackTick: () => void;
	private readonly cacheAlbumArt: (imageUrl: string) => Promise<void>;
	private readonly prewarmArtwork: (imageUrl: string) => void;
	private readonly refreshTrackCachedCount: () => void;
	private readonly resolveArtistLogoUrl: (artistId: string) => Promise<string | null>;
	private readonly showPlaybackToast: (message: string) => void;
	private readonly trackSourceNative: TrackSourceNative;
	private readonly requestRerender: () => void;
	private readonly requestOverlayRerender: () => void;
	private readonly deferredDownloadCoordinator = new DeferredPlaybackDownloadCoordinator();
	private readonly trackPrefetchQueue: TrackPlaybackNativePrefetchQueue;

	private recentlyPlayedStore?: RecentlyPlayedStore;
	private scrobbleService?: ScrobbleService;
	private paletteService?: NowPlayingPaletteService;
	private paletteQueue?: NowPlayingPaletteQueue;
	private lastArtworkUrl: string | null = null;
	private resolvingArtistLogoId: string | null = null;
	private trackPlaybackSourceUrl: string | null = null;
	private nextTrackSourceUrl: string | null = null;
	private lastUpcomingQueueKey = '';
	private lastRetainedTrackIdsKey = '';
	private lastTrackSourceTrackId: string | null = null;
	private lastTrackFetchErrorTrackId: string | null = null;
	private playbackSourceRequestId = 0;
	private readonly inFlightTrackDownloadIds = new Set<string>();
	private lastPlaybackEventKey = '';
	private lastPrefetchTracksRef: Array<Track> | null = null;
	private lastPrefetchTrackIndex = -1;
	private lastPrefetchTransport: unknown = null;
	private waveformService?: WaveformService;
	private waveformRenderCache?: WaveformRenderCache;
	private enqueueWaveform?: (trackId: string, audioPath: string) => void;
	private reorderWaveformQueue?: (trackIds: Array<string>) => void;
	private disposeWaveformQueue?: () => void;
	private unsubscribeWaveform?: () => void;
	private unsubscribeWaveformRender?: () => void;
	private readonly overlayContentListeners = new Set<() => void>();
	private lastWaveformPriorityTracksRef: Array<Track> | null = null;
	private lastWaveformPriorityTrackIndex = -1;
	private lastUpcomingPaletteTracksRef: Array<Track> | null = null;
	private lastUpcomingPaletteTrackIndex = -1;
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
		this.getAccessToken = deps.getAccessToken;
		this.downloads = deps.downloads;
		this.getTrackCacheMaxTracks = deps.getTrackCacheMaxTracks;
		this.getTrackCacheUrl = deps.getTrackCacheUrl;
		this.getTransportToken = deps.getTransportToken;
		this.isOfflinePlaybackMode = deps.isOfflinePlaybackMode;
		this.onPlaybackTick = deps.onPlaybackTick;
		this.cacheAlbumArt = deps.cacheAlbumArt;
		this.prewarmArtwork = deps.prewarmArtwork;
		this.refreshTrackCachedCount = deps.refreshTrackCachedCount;
		this.resolveArtistLogoUrl = deps.resolveArtistLogoUrl;
		this.showPlaybackToast = deps.showPlaybackToast;
		this.trackSourceNative = deps.trackSourceNative;
		this.requestRerender = deps.requestRerender;
		this.requestOverlayRerender = deps.requestOverlayRerender;
		this.trackPrefetchQueue = new TrackPlaybackNativePrefetchQueue(
			(track) => this.getTrackCacheUrl(track.id),
			(trackId) =>
				this.getNativeCachedTrackSource(trackId) != null ||
				this.getDownloadedTrackSource(trackId) != null,
			(trackId, url, onComplete) => {
				if (!this.isUrl(url)) {
					// already a local file (downloaded/offline); nothing to fetch over HTTP
					onComplete(null);
					return;
				}
				this.trackSourceNative.cacheTrackFromUrl(
					trackId,
					url,
					this.getAccessToken(),
					(rawSource) => {
						onComplete(rawSource ? this.normalizePlaybackFileSource(rawSource) : null);
					},
				);
			},
			(trackId) => this.handleTrackCached(trackId),
		);
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

		// a track change means the engine may have just persisted a scrobble (natural end or a leave
		// past threshold); deliver anything pending. offline deliveries fail and stay queued.
		fireAndForget('deliverScrobbles', this.deliverPendingScrobbles());
		this.onPlaybackTick();
	}

	private deliverPendingScrobbles(): Promise<void> {
		return this.scrobbleService?.syncFromNative() ?? Promise.resolve();
	}

	// run the full ordered reconciliation against the current playback state: artwork, sources,
	// upcoming/prefetch queues, recently-played, waveforms and artist logo. shared by the per-tick
	// subscription and the at-startup pass so the ordering lives in one place
	reconcilePlaybackState(): void {
		this.handleAlbumChange();
		if (!this.handleTrackPlaybackSourceChange()) {
			this.handleNextTrackPreload();
		}
		this.prewarmUpcomingPalettes();
		this.syncUpcomingQueue();
		this.syncRetainedTrackIds();
		this.handleTrackPrefetchQueueChange();
		this.captureRecentlyPlayedTrack();
		this.handleWaveformPriority();
		this.resolveCurrentArtistLogo();
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
		this.deferredDownloadCoordinator.reset();
		this.trackPrefetchQueue.clearQueue();
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
		fireAndForget('deliverScrobbles', services.scrobble.syncFromNative());
		this.recentlyPlayedRestoring = true;
		this.recentlyPlayedTracks = [];
		this.lastObservedRecentTrackId = null;
		this.restoreGeneration += 1;
		fireAndForget('restoreRecentlyPlayed', this.restoreRecentlyPlayed(this.restoreGeneration));

		this.teardownWaveform();
		this.waveformService = services.waveformService;
		this.waveformRenderCache = services.waveformRenderCache;
		this.enqueueWaveform = services.enqueueWaveform;
		this.reorderWaveformQueue = services.reorderWaveformQueue;
		this.disposeWaveformQueue = services.disposeWaveformQueue;
		this.lastWaveformPriorityTracksRef = null;
		this.lastWaveformPriorityTrackIndex = -1;
		this.lastUpcomingPaletteTracksRef = null;
		this.lastUpcomingPaletteTrackIndex = -1;
		fireAndForget('waveformWarmUp', this.waveformService.warmUp());
		this.unsubscribeWaveform = this.waveformService.subscribe(() => this.notifyOverlayContent());
		this.unsubscribeWaveformRender = this.waveformRenderCache.subscribe(() =>
			this.notifyOverlayContent(),
		);
	}

	// the now-playing overlay reads waveform masks (getWaveformMaskUrl) which resolve asynchronously
	// as decodes/renders complete; it subscribes here so it re-renders when they land, rather than
	// waiting for the next playback-state change
	subscribeOverlayContent(listener: () => void): () => void {
		this.overlayContentListeners.add(listener);
		return () => {
			this.overlayContentListeners.delete(listener);
		};
	}

	private notifyOverlayContent(): void {
		this.requestOverlayRerender();
		for (const listener of [...this.overlayContentListeners]) {
			listener();
		}
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
		return this.scrobbleService?.getPendingCount();
	}

	notifyAppReady(): void {
		if (this.scrobbleService) {
			fireAndForget('deliverScrobbles', this.scrobbleService.syncFromNative());
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

	prewarmUpcomingPalettes(): void {
		const paletteService = this.paletteService;
		const paletteQueue = this.paletteQueue;
		if (!paletteService || !paletteQueue) {
			return;
		}
		const { tracks, trackIndex } = this.playbackStore;
		if (tracks.length === 0) {
			return;
		}
		if (
			tracks === this.lastUpcomingPaletteTracksRef &&
			trackIndex === this.lastUpcomingPaletteTrackIndex
		) {
			return;
		}
		this.lastUpcomingPaletteTracksRef = tracks;
		this.lastUpcomingPaletteTrackIndex = trackIndex;

		const seen = new Set<string>();
		const urls: Array<string> = [];
		for (const track of tracks.slice(
			trackIndex + 1,
			trackIndex + 1 + UPCOMING_PALETTE_PREWARM_COUNT,
		)) {
			const url = track.albumImageUrl;
			if (!url || url === this.lastArtworkUrl || seen.has(url) || paletteService.hasPalette(url)) {
				continue;
			}
			seen.add(url);
			urls.push(url);
		}
		if (urls.length === 0) {
			return;
		}

		const run = (): void => this.warmUpcomingPalettes(urls, paletteService, paletteQueue);
		const deferralSource = this.upcomingPaletteDeferralSource();
		if (deferralSource) {
			this.deferredDownloadCoordinator.defer('palette', {
				requestId: this.playbackSourceRequestId,
				run,
				source: deferralSource,
				trackId: this.playbackStore.track?.id ?? '',
			});
			return;
		}
		run();
	}

	private upcomingPaletteDeferralSource(): string | null {
		const activeTrack = this.playbackStore.track;
		if (
			!activeTrack ||
			!this.playbackStore.isPlaying ||
			this.getNativeCachedTrackSource(activeTrack.id) != null
		) {
			return null;
		}
		// includes offline/downloaded playback: decoding upcoming artwork still contends with the
		// engine opening the current local file at play start, so hold it behind the cushion too
		return this.getTrackStreamSource(activeTrack.id);
	}

	private warmUpcomingPalettes(
		urls: Array<string>,
		paletteService: NowPlayingPaletteService,
		paletteQueue: NowPlayingPaletteQueue,
	): void {
		fireAndForget(
			'upcomingPaletteWarmUp',
			paletteService
				.warmUp(urls)
				.then(() => this.cacheUpcomingPaletteArt(urls, paletteService, paletteQueue)),
		);
	}

	private async cacheUpcomingPaletteArt(
		urls: Array<string>,
		paletteService: NowPlayingPaletteService,
		paletteQueue: NowPlayingPaletteQueue,
	): Promise<void> {
		const pending = urls.filter((url) => !paletteService.hasPalette(url));
		let cursor = 0;
		const worker = async (): Promise<void> => {
			while (cursor < pending.length) {
				const url = pending[cursor];
				cursor += 1;
				try {
					await this.cacheAlbumArt(url);
				} catch {
					continue;
				}
				if (!paletteService.hasPalette(url)) {
					paletteQueue.enqueue(url);
				}
			}
		};
		const workerCount = Math.min(UPCOMING_PALETTE_CACHE_CONCURRENCY, pending.length);
		await Promise.all(Array.from({ length: workerCount }, () => worker()));
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

	getTrackPlaybackSourceUrl(): string | null {
		return this.trackPlaybackSourceUrl;
	}

	getNextTrackSourceUrl(): string | null {
		return this.nextTrackSourceUrl;
	}

	private computeNextTrackSource(): string | null {
		const { loopMode, trackIndex, tracks } = this.playbackStore;
		let nextIndex = trackIndex + 1;
		if (nextIndex >= tracks.length) {
			if (loopMode === 'queue' && tracks.length > 0) {
				nextIndex = 0;
			} else {
				return null;
			}
		}
		const nextTrack = tracks[nextIndex];
		return nextTrack ? this.resolveTrackSource(nextTrack.id) : null;
	}

	applyPlaybackSources(currentSource: string | null): void {
		const nextSource = this.computeNextTrackSource();
		if (this.trackPlaybackSourceUrl === currentSource && this.nextTrackSourceUrl === nextSource) {
			return;
		}
		this.trackPlaybackSourceUrl = currentSource;
		this.nextTrackSourceUrl = nextSource;
		this.requestRerender();
	}

	handleNextTrackPreload(): void {
		const nextSource = this.computeNextTrackSource();
		if (this.nextTrackSourceUrl === nextSource) {
			return;
		}
		this.nextTrackSourceUrl = nextSource;
		this.requestRerender();
	}

	setTrackPlaybackSource(source: string | null): void {
		if (this.trackPlaybackSourceUrl === source) {
			return;
		}
		this.trackPlaybackSourceUrl = source;
		this.requestRerender();
	}

	resetPlaybackSources(): void {
		if (this.trackPlaybackSourceUrl === null && this.nextTrackSourceUrl === null) {
			return;
		}
		this.trackPlaybackSourceUrl = null;
		this.nextTrackSourceUrl = null;
		this.requestRerender();
	}

	syncUpcomingQueue(): void {
		const window = buildPlaybackQueueWindow(this.playbackStore, (trackId) =>
			this.resolveTrackSource(trackId),
		);
		const payload = serializeQueueWindow(window);
		if (payload === this.lastUpcomingQueueKey) {
			return;
		}

		this.lastUpcomingQueueKey = payload;
		try {
			this.trackSourceNative.setUpcomingQueue(payload);
		} catch {
			// native module without upcoming-queue support (e.g. mock platform builds)
		}
	}

	// tells the streaming cache which track ids form the current sliding window so its prune
	// never evicts them. index-based, so it converges on every queue mutation regardless of
	// which sources have resolved yet
	syncRetainedTrackIds(): void {
		const ids = buildRetainedTrackIds(this.playbackStore, this.getTrackCacheMaxTracks());
		const key = JSON.stringify(ids);
		if (key === this.lastRetainedTrackIdsKey) {
			return;
		}

		this.lastRetainedTrackIdsKey = key;
		try {
			this.trackSourceNative.setRetainedTrackIds(ids);
		} catch {
			// native module without retained-ids support (e.g. mock platform builds)
		}
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

		// decoding the current (and upcoming) files competes with the engine opening the current
		// track at play start and stutters it, so hold the waveform pass back until the track has
		// actually started playing (playback-cushion). pre-generation then keeps upcoming tracks
		// ready ahead of their turn. paused, or before a source is bound, there is no start to
		// protect (and nothing to release it), so run immediately
		const deferralSource = this.playbackStore.isPlaying ? this.getTrackPlaybackSourceUrl() : null;
		if (deferralSource) {
			this.deferredDownloadCoordinator.defer('waveform', {
				requestId: this.playbackSourceRequestId,
				run: () => this.runWaveformPriority(),
				source: deferralSource,
				trackId: this.playbackStore.track?.id ?? '',
			});
			return;
		}
		this.runWaveformPriority();
	}

	private runWaveformPriority(): void {
		const { tracks, trackIndex } = this.playbackStore;
		const end = Math.min(tracks.length, trackIndex + WAVEFORM_PREGEN_WINDOW);
		for (let i = trackIndex; i < end; i++) {
			const audioPath = this.getAudioFileUrl(tracks[i].id);
			if (audioPath) {
				this.scheduleAndEnqueueWaveform(tracks[i].id, audioPath);
			}
		}
		this.reorderWaveformQueue?.(this.getPlaybackTrackIds());
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

	private resolveTrackSource(trackId: string): string | null {
		return (
			this.getDownloadedTrackSource(trackId) ??
			this.getNativeCachedTrackSource(trackId) ??
			this.getTrackStreamSource(trackId)
		);
	}

	private getDownloadedTrackSource(trackId: string): string | null {
		if (!trackId) {
			return null;
		}
		try {
			if (!this.downloads.isTrackDownloaded(trackId)) {
				return null;
			}
			const source = this.downloads.getTrackPlaybackUrl(trackId);
			return source ? this.normalizePlaybackFileSource(source) : null;
		} catch {
			return null;
		}
	}

	private getNativeCachedTrackSource(trackId: string): string | null {
		if (!trackId) {
			return null;
		}
		try {
			const source = this.trackSourceNative.getCachedTrackFileUrl(trackId);
			if (!source) {
				return null;
			}
			return this.normalizePlaybackFileSource(source);
		} catch {
			return null;
		}
	}

	private getTrackStreamSource(trackId: string): string | null {
		const url = this.getTrackCacheUrl(trackId);
		if (!url) {
			return null;
		}
		return this.normalizePlaybackFileSource(url);
	}

	private normalizePlaybackFileSource(source: string): string {
		return source.trim();
	}

	private isUrl(url: string | null | undefined): boolean {
		return url != null && (url.startsWith('http://') || url.startsWith('https://'));
	}

	private summarizeCacheError(message: string): string {
		if (!message) {
			return 'unknown error';
		}
		const markerIndex = message.indexOf(':');
		if (markerIndex <= 0) {
			return message;
		}
		return message.slice(0, markerIndex);
	}

	handleTrackPlaybackSourceChange(force = false): boolean {
		const activeTrack = this.playbackStore.track;

		if (!activeTrack) {
			this.playbackSourceRequestId += 1;
			this.lastTrackSourceTrackId = null;
			this.setTrackPlaybackSource(null);
			return false;
		}

		if (!force && this.lastTrackSourceTrackId === activeTrack.id) {
			const shouldRetryForMissingSource =
				this.playbackStore.isPlaying && this.getTrackPlaybackSourceUrl() == null;
			if (!shouldRetryForMissingSource) {
				return false;
			}
		}

		this.lastTrackSourceTrackId = activeTrack.id;
		const requestId = this.playbackSourceRequestId + 1;
		this.playbackSourceRequestId = requestId;
		const source = this.resolveTrackSource(activeTrack.id);
		let appliedNext = false;
		if (source && this.getTrackPlaybackSourceUrl() !== source) {
			this.applyPlaybackSources(source);
			appliedNext = true;
		}

		if (!source || !this.isUrl(source) || this.isOfflinePlaybackMode()) {
			return appliedNext;
		}

		if (this.playbackStore.isPlaying) {
			this.deferredDownloadCoordinator.defer('current', {
				requestId,
				run: () => {
					this.downloadCurrentTrackForPlayback(activeTrack.id, requestId, source);
				},
				source,
				trackId: activeTrack.id,
			});
		} else {
			this.downloadCurrentTrackForPlayback(activeTrack.id, requestId, source);
		}

		return appliedNext;
	}

	private downloadCurrentTrackForPlayback(
		trackId: string,
		requestId: number,
		resolvedStreamSource: string | null,
	): void {
		if (!trackId || this.inFlightTrackDownloadIds.has(trackId)) {
			return;
		}

		const url = resolvedStreamSource ?? this.getTrackStreamSource(trackId);
		if (!url) {
			this.handleTrackCacheFetchFailed(trackId, 'no url');
			return;
		}

		if (!this.isUrl(url)) {
			// already a local file (downloaded/offline); nothing to download over HTTP
			return;
		}

		// held until the async cache callback resolves; clearing it synchronously would let a
		// still-in-flight (or instantly-failing) download re-fire in a tight loop
		this.inFlightTrackDownloadIds.add(trackId);

		try {
			this.trackSourceNative.cacheTrackFromUrl(trackId, url, this.getAccessToken(), (rawSource) => {
				this.inFlightTrackDownloadIds.delete(trackId);
				const nativeSource = rawSource ? this.normalizePlaybackFileSource(rawSource) : null;
				if (nativeSource) {
					if (requestId !== this.playbackSourceRequestId) {
						return;
					}

					if (this.playbackStore.track?.id !== trackId) {
						return;
					}

					this.handleTrackCached(trackId);
					return;
				}

				this.handleTrackCacheFetchFailed(trackId, 'native cache failed');
			});
		} catch (error) {
			this.inFlightTrackDownloadIds.delete(trackId);
			const rawMessage =
				typeof error === 'string'
					? error
					: error instanceof Error
						? error.message
						: 'unknown error';
			const message = this.summarizeCacheError(rawMessage);
			this.showPlaybackToast(`cache flow exception: ${message}`);
			this.handleTrackCacheFetchFailed(trackId, `exception: ${message}`);
		}
	}

	handleTrackCached(trackId: string): void {
		this.lastTrackFetchErrorTrackId = null;
		this.refreshTrackCachedCount();

		const audioPath = this.getAudioFileUrl(trackId);
		if (audioPath) {
			this.enqueueWaveformIfNeeded(trackId, audioPath);
		}

		const isCurrentTrack = this.playbackStore.track?.id === trackId;
		const currentSourceUnbound = this.getTrackPlaybackSourceUrl() == null;
		if (isCurrentTrack && currentSourceUnbound && this.handleTrackPlaybackSourceChange(true)) {
			this.syncUpcomingQueue();
			return;
		}

		this.handleNextTrackPreload();
		this.syncUpcomingQueue();
	}

	private handleTrackCacheFetchFailed(trackId: string, reason = 'unknown'): void {
		if (this.playbackStore.track?.id !== trackId) {
			return;
		}

		if (this.isOfflinePlaybackMode()) {
			return;
		}

		if (this.lastTrackFetchErrorTrackId === trackId) {
			return;
		}

		this.lastTrackFetchErrorTrackId = trackId;
		this.showPlaybackToast(`cache failed: ${reason}`);

		const streamUrl = this.getTrackStreamSource(trackId);
		if (streamUrl) {
			this.enqueueWaveformIfNeeded(trackId, streamUrl);
		}
	}

	handleTrackPrefetchQueueChange(force = false): void {
		const activeTrack = this.playbackStore.track;
		const tracks = this.playbackStore.tracks;
		const trackIndex = this.playbackStore.trackIndex;

		if (!activeTrack || tracks.length === 0) {
			this.lastPrefetchTracksRef = null;
			this.lastPrefetchTrackIndex = -1;
			this.lastPrefetchTransport = this.getTransportToken();
			this.deferredDownloadCoordinator.cancel('prefetch');
			this.trackPrefetchQueue.clearQueue();
			return;
		}

		if (this.isOfflinePlaybackMode()) {
			// offline tracks are already local files; there is nothing to prefetch over HTTP
			this.deferredDownloadCoordinator.cancel('prefetch');
			this.trackPrefetchQueue.clearQueue();
			return;
		}

		if (
			!force &&
			tracks === this.lastPrefetchTracksRef &&
			trackIndex === this.lastPrefetchTrackIndex &&
			this.getTransportToken() === this.lastPrefetchTransport
		) {
			return;
		}

		this.lastPrefetchTracksRef = tracks;
		this.lastPrefetchTrackIndex = trackIndex;
		this.lastPrefetchTransport = this.getTransportToken();

		const nextTrackIndex = trackIndex + 1;
		if (nextTrackIndex >= tracks.length) {
			this.deferredDownloadCoordinator.cancel('prefetch');
			this.trackPrefetchQueue.clearQueue();
			return;
		}

		// bound prefetch to the retained forward runway so we never fetch a track the cache
		// would immediately evict
		const prefetchDepth = retainedForwardCount(this.playbackStore, this.getTrackCacheMaxTracks());
		if (prefetchDepth <= 0) {
			this.deferredDownloadCoordinator.cancel('prefetch');
			this.trackPrefetchQueue.clearQueue();
			return;
		}

		const streamSource =
			this.playbackStore.isPlaying &&
			!this.isOfflinePlaybackMode() &&
			this.getNativeCachedTrackSource(activeTrack.id) == null
				? this.getTrackStreamSource(activeTrack.id)
				: null;

		if (streamSource) {
			this.deferredDownloadCoordinator.defer('prefetch', {
				requestId: this.playbackSourceRequestId,
				run: () => this.trackPrefetchQueue.replaceQueue(tracks, nextTrackIndex, prefetchDepth),
				source: streamSource,
				trackId: activeTrack.id,
			});
			return;
		}

		this.deferredDownloadCoordinator.cancel('prefetch');
		this.trackPrefetchQueue.replaceQueue(tracks, nextTrackIndex, prefetchDepth);
	}

	handlePlaybackError(error: string): void {
		const normalized = error?.trim() ?? '';
		this.showPlaybackToast(
			normalized.length > 0 ? `playback error: ${normalized}` : 'playback error',
		);
	}

	handlePlaybackEvent(event: string): void {
		if (!event) {
			return;
		}

		const trackId = this.playbackStore.track?.id ?? 'none';
		const source = this.getTrackPlaybackSourceUrl() ?? 'none';
		const eventKey = `${event}|${trackId}|${source}`;
		if (this.lastPlaybackEventKey === eventKey) {
			return;
		}

		this.lastPlaybackEventKey = eventKey;

		if (event === 'playback-cushion') {
			this.deferredDownloadCoordinator.onPlaybackStarted({
				currentRequestId: this.playbackSourceRequestId,
				currentTrackId: this.playbackStore.track?.id ?? null,
				source,
			});
		}
	}

	handleTrackCompleted(): void {
		const track = this.playbackStore.track;
		if (track) {
			this.playbackStore.updateProgress(track.duration);
		}
	}

	resetForTrackCacheCleared(): void {
		this.lastTrackFetchErrorTrackId = null;
		this.lastTrackSourceTrackId = null;
		this.lastPrefetchTracksRef = null;
		this.lastPrefetchTrackIndex = -1;
		this.lastPrefetchTransport = null;
		this.playbackSourceRequestId += 1;
		this.deferredDownloadCoordinator.reset();
		this.resetPlaybackSources();
		this.handleTrackPrefetchQueueChange(true);
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
