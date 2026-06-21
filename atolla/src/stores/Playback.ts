import type { Album } from '../models/Album';
import { isTrack, sanitizeTracks, type Track } from '../models/Track';
import { DebugLogger } from '../services/DebugLogger';

type PlaybackListener = () => void;

interface PlaybackQueueStore {
	fetchString(key: string): Promise<string>;
	storeString(key: string, value: string): Promise<void>;
}

interface PersistedPlaybackQueue {
	album: Album | null;
	artistLogoUrls: Array<string | null>;
	progressSeconds: number;
	trackIndex: number;
	tracks: Array<Track>;
}

const playbackQueueCacheKey = 'queue';
const playbackActiveKey = 'queue_active';
const progressPersistStepSeconds = 5;
const PREVIOUS_RESTART_THRESHOLD_SECONDS = 3;

export const LoopModes = {
	none: 'none',
	queue: 'queue',
	track: 'track',
} as const;

export type LoopMode = (typeof LoopModes)[keyof typeof LoopModes];

export function shuffleArray<T>(arr: Array<T>): Array<T> {
	const copy = [...arr];
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy;
}

export class PlaybackStore {
	private listeners = new Set<PlaybackListener>();
	private _artistLogoUrls: Array<string | null> = [];
	private queueStore: PlaybackQueueStore | null = null;
	private queueStoreLoadToken = 0;
	private queueRestoreSuperseded = false;
	private lastPersistedProgressSeconds = 0;
	private seekPersistTimer: ReturnType<typeof setTimeout> | null = null;
	private notifySuspendDepth = 0;
	private notifyPendingDuringSuspend = false;

	album: Album | null = null;
	isPlaying: boolean = false;
	loopMode: LoopMode = LoopModes.none;
	progressSeconds: number = 0;
	seekTarget: number | null = null;
	trackIndex: number = 0;
	tracks: Array<Track> = [];
	// deliberate track changes (play/previous/jump) may rebuild the native queue backward; a restore/reconcile snap following the engine must not (that snap is the stale wake-race the native guard suppresses); read by NativeAudioPlayer when configuring the engine
	allowBackwardRebuild: boolean = true;

	async setQueueStore(
		store: PlaybackQueueStore | null,
		isPlayingFn?: () => boolean,
		currentNativeTrackFn?: () => { trackId: string; positionSeconds: number } | null,
	): Promise<void> {
		this.queueStore = store;
		const token = ++this.queueStoreLoadToken;
		this.queueRestoreSuperseded = false;

		if (!store) {
			return;
		}

		try {
			const [activeMarker, raw] = await Promise.all([
				store.fetchString(playbackActiveKey).catch(() => ''),
				store.fetchString(playbackQueueCacheKey),
			]);
			if (
				token !== this.queueStoreLoadToken ||
				this.queueStore !== store ||
				this.queueRestoreSuperseded
			) {
				DebugLogger.log('PlaybackStore', 'queue restore aborted', {
					storeMismatch: this.queueStore !== store,
					superseded: this.queueRestoreSuperseded,
					tokenMismatch: token !== this.queueStoreLoadToken,
				});
				return;
			}

			if (activeMarker === 'false') {
				DebugLogger.log('PlaybackStore', 'queue restore skipped: inactive marker set');
				return;
			}

			const parsed = JSON.parse(raw);
			if (!isPersistedPlaybackQueue(parsed)) {
				DebugLogger.log('PlaybackStore', 'queue restore: invalid persisted data');
				return;
			}

			this.tracks = sanitizeTracks(parsed.tracks);
			this.album = parsed.album;
			this.trackIndex = Math.max(0, Math.min(parsed.trackIndex, parsed.tracks.length - 1));
			this._artistLogoUrls = parsed.tracks.map((_, index) => parsed.artistLogoUrls[index] ?? null);

			this.isPlaying = isPlayingFn?.() === true;
			DebugLogger.log('PlaybackStore', 'queue restore applied', {
				isPlaying: this.isPlaying,
				progressSeconds: parsed.progressSeconds,
				trackCount: parsed.tracks.length,
				trackIndex: this.trackIndex,
			});
			const currentTrack = this.tracks[this.trackIndex] ?? null;
			const maxProgress = currentTrack?.duration ?? 0;
			const restoredProgress = Number.isFinite(parsed.progressSeconds) ? parsed.progressSeconds : 0;
			this.progressSeconds = Math.max(0, Math.min(restoredProgress, maxProgress));
			this.lastPersistedProgressSeconds = this.progressSeconds;
			this.seekTarget = null;
			// persisted index/progress can be stale (engine auto-advanced while JS was frozen); snap to the engine's track before notifying so App.tsx computes a matching source
			const nativeNow = currentNativeTrackFn?.() ?? null;
			if (nativeNow?.trackId) {
				const nativeIndex = this.indexOfNearestTrackId(nativeNow.trackId);
				if (nativeIndex !== -1) {
					this.trackIndex = nativeIndex;
					const nativeMaxProgress = this.tracks[nativeIndex]?.duration ?? 0;
					const nativeProgress = Number.isFinite(nativeNow.positionSeconds)
						? nativeNow.positionSeconds
						: 0;
					this.progressSeconds = Math.max(0, Math.min(nativeProgress, nativeMaxProgress));
					this.lastPersistedProgressSeconds = this.progressSeconds;
				}
			}
			// a restore follows the engine, so don't let a stale restored track shove it backward
			this.allowBackwardRebuild = false;
			this.notify();
		} catch {
			// best effort restore
		}
	}

	cycleLoopMode(): void {
		switch (this.loopMode) {
			case LoopModes.none:
				this.loopMode = LoopModes.queue;
				break;
			case LoopModes.queue:
				this.loopMode = LoopModes.track;
				break;
			default:
				this.loopMode = LoopModes.none;
				break;
		}

		this.notify();
	}

	get artistLogoUrl(): string | null {
		return this._artistLogoUrls[this.trackIndex] ?? null;
	}

	// artist id whose logo is missing for the current track, or null when there's already a logo, no current track, or nothing to resolve from
	get unresolvedArtistLogoArtistId(): string | null {
		if (!this.track || this.artistLogoUrl) return null;
		return this.track.artistId ?? this.album?.artistId ?? null;
	}

	get track(): Track | null {
		return this.tracks[this.trackIndex] ?? null;
	}

	subscribe(listener: PlaybackListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	play(tracks: Array<Track>, album: Album, startIndex = 0): void {
		DebugLogger.log('PlaybackStore', 'play', {
			albumId: album?.id,
			startIndex,
			trackCount: tracks.length,
		});
		const sanitizedTracks = sanitizeTracks(tracks);
		const clampedIndex = Math.max(0, Math.min(sanitizedTracks.length - 1, startIndex));
		this.queueRestoreSuperseded = true;
		this.allowBackwardRebuild = true;
		this.tracks = sanitizedTracks;
		this.album = album;
		this.trackIndex = clampedIndex;
		this.isPlaying = true;
		this.progressSeconds = 0;
		this.seekTarget = null;
		this._artistLogoUrls = [];
		// clear inactive marker so the next cold start can restore this queue
		void this.queueStore?.storeString(playbackActiveKey, 'true').catch(() => {});
		this.persistQueue();
		this.notify();
	}

	jumpToIndex(index: number): void {
		DebugLogger.log('PlaybackStore', 'jumpToIndex', { index, trackCount: this.tracks.length });
		this.queueRestoreSuperseded = true;
		this.allowBackwardRebuild = true;
		const clamped = Math.max(0, Math.min(this.tracks.length - 1, index));
		this.trackIndex = clamped;
		this.progressSeconds = 0;
		this.seekTarget = null;
		this.isPlaying = true;
		this.persistQueue();
		this.notify();
	}

	next(): void {
		if (this.trackIndex >= this.tracks.length - 1) {
			return;
		}
		this.allowBackwardRebuild = true;
		this.trackIndex += 1;
		this.progressSeconds = 0;
		this.seekTarget = null;
		this.persistQueue();
		this.notify();
	}

	// reconciles the store with native auto-advances that happened while JS was frozen: the
	// engine reports the trackId that finished and the store jumps to the track after it.
	// never sets seekTarget (the native player already moved); idempotent for stale completions
	advancePastTrackId(finishedTrackId: string): void {
		if (this.tracks.length === 0 || !finishedTrackId) {
			return;
		}

		this.allowBackwardRebuild = false;

		if (this.loopMode === LoopModes.track) {
			if (this.track?.id !== finishedTrackId) {
				return;
			}
			this.progressSeconds = 0;
			this.persistQueue();
			this.notify();
			return;
		}

		let finishedIndex = -1;
		for (let index = this.trackIndex; index < this.tracks.length; index++) {
			if (this.tracks[index]?.id === finishedTrackId) {
				finishedIndex = index;
				break;
			}
		}
		if (finishedIndex === -1) {
			return;
		}

		if (finishedIndex >= this.tracks.length - 1) {
			if (this.loopMode === LoopModes.queue) {
				this.trackIndex = 0;
				this.progressSeconds = 0;
			} else {
				this.trackIndex = finishedIndex;
				this.progressSeconds = this.tracks[finishedIndex]?.duration ?? 0;
				this.isPlaying = false;
			}
		} else {
			this.trackIndex = finishedIndex + 1;
			this.progressSeconds = 0;
		}

		this.persistQueue();
		this.notify();
	}

	// reconciles the store with a native track jump (e.g. the notification's previous button
	// stepping back through history while JS was frozen): the engine reports the track now
	// current and the store follows. never sets seekTarget (the native player already moved);
	// duplicate ids resolve to the occurrence nearest the current index
	jumpToTrackId(trackId: string): void {
		if (!trackId || this.tracks.length === 0) {
			return;
		}

		const targetIndex = this.indexOfNearestTrackId(trackId);
		if (targetIndex === -1) {
			return;
		}

		this.allowBackwardRebuild = false;
		this.trackIndex = targetIndex;
		this.progressSeconds = 0;
		this.persistQueue();
		this.notify();
	}

	// reconciles the store to the native engine's actual current track and position on wake,
	// before App.tsx computes a playback source. while JS was frozen the engine auto-advanced;
	// the store (and disk) are stale, and pushing the stale source down makes the native player
	// rebuild its queue from position 0 (audible as a restart)
	reconcileToNativeTrack(trackId: string, positionSeconds: number): void {
		if (!trackId || this.tracks.length === 0) {
			return;
		}

		const targetIndex = this.indexOfNearestTrackId(trackId);
		if (targetIndex === -1) {
			return;
		}

		const maxProgress = this.tracks[targetIndex]?.duration ?? 0;
		const clamped = Number.isFinite(positionSeconds)
			? Math.max(0, Math.min(positionSeconds, maxProgress))
			: 0;

		if (this.trackIndex === targetIndex && this.progressSeconds === clamped) {
			return;
		}

		this.allowBackwardRebuild = false;
		this.trackIndex = targetIndex;
		this.progressSeconds = clamped;
		this.seekTarget = null;
		this.lastPersistedProgressSeconds = clamped;
		this.persistQueue();
		this.notify();
	}

	// index of the occurrence of trackId nearest the current trackIndex, or -1 when absent
	private indexOfNearestTrackId(trackId: string): number {
		let targetIndex = -1;
		let bestDistance = Number.POSITIVE_INFINITY;
		for (let index = 0; index < this.tracks.length; index++) {
			if (this.tracks[index]?.id !== trackId) {
				continue;
			}
			const distance = Math.abs(index - this.trackIndex);
			if (distance < bestDistance) {
				targetIndex = index;
				bestDistance = distance;
			}
		}
		return targetIndex;
	}

	previous(): void {
		this.allowBackwardRebuild = true;
		this.trackIndex = Math.max(this.trackIndex - 1, 0);
		this.progressSeconds = 0;
		this.seekTarget = null;
		this.persistQueue();
		this.notify();
	}

	// restart the current track when more than ~3s in (or already first), else go back a track
	previousOrRestart(): void {
		if (this.progressSeconds > PREVIOUS_RESTART_THRESHOLD_SECONDS || this.trackIndex === 0) {
			this.seekTo(0);
			return;
		}
		this.previous();
	}

	playPause(): void {
		DebugLogger.log('PlaybackStore', 'playPause', {
			trackId: this.track?.id,
			wasPlaying: this.isPlaying,
		});
		// an explicit user toggle must win over a still-resolving queue restore, which would
		// otherwise overwrite isPlaying with the (possibly stale) native snapshot
		this.queueRestoreSuperseded = true;
		this.isPlaying = !this.isPlaying;
		if (!this.isPlaying) {
			this.persistQueue();
		}
		this.notify();
	}

	// reconciles the store's playing state with the native engine on wake, when the native
	// player advanced through tracks while JS was frozen and is still playing: the store must
	// follow it rather than push a stale paused state. idempotent and side-effect-free beyond
	// the notification (isPlaying isn't persisted)
	setPlaying(isPlaying: boolean): void {
		if (this.isPlaying === isPlaying) {
			return;
		}
		this.isPlaying = isPlaying;
		this.notify();
	}

	updateProgress(seconds: number): void {
		const activeTrack = this.track;
		if (!activeTrack) return;

		this.seekTarget = null;

		let queueStateChanged = false;

		if (seconds >= activeTrack.duration) {
			if (this.loopMode === LoopModes.track) {
				this.progressSeconds = 0;
				this.seekTarget = 0;
			} else if (this.trackIndex >= this.tracks.length - 1) {
				if (this.loopMode === LoopModes.queue && this.tracks.length > 0) {
					this.allowBackwardRebuild = true;
					this.trackIndex = 0;
					this.progressSeconds = 0;
					this.seekTarget = 0;
					queueStateChanged = true;
				} else {
					this.progressSeconds = activeTrack.duration;
					this.isPlaying = false;
					this.persistQueue();
				}
			} else {
				this.allowBackwardRebuild = true;
				this.trackIndex += 1;
				this.progressSeconds = 0;
				queueStateChanged = true;
			}
		} else {
			this.progressSeconds = seconds;
			if (
				this.isPlaying &&
				this.progressSeconds - this.lastPersistedProgressSeconds >= progressPersistStepSeconds
			) {
				this.persistQueue();
			}
		}

		if (queueStateChanged) {
			this.persistQueue();
		}

		this.notify();
	}

	seekTo(seconds: number): void {
		const activeTrack = this.track;
		if (!activeTrack) return;

		const clamped = Math.max(0, Math.min(activeTrack.duration, seconds));
		this.seekTarget = clamped;
		this.progressSeconds = clamped;
		// update the persisted baseline so the step logic in updateProgress doesn't immediately
		// fire another persist when playback resumes after seeking
		this.lastPersistedProgressSeconds = clamped;
		if (this.seekPersistTimer != null) clearTimeout(this.seekPersistTimer);
		this.seekPersistTimer = setTimeout(() => {
			this.seekPersistTimer = null;
			this.persistQueue();
		}, 400);
		this.notify();
	}

	persistNow(): void {
		this.persistQueue();
	}

	skipForward(seconds = 10): void {
		this.seekTo(this.progressSeconds + seconds);
	}

	stop(): void {
		this.queueRestoreSuperseded = true;
		this.tracks = [];
		this.album = null;
		this._artistLogoUrls = [];
		this.isPlaying = false;
		this.progressSeconds = 0;
		this.trackIndex = 0;
		// write the inactive marker before the full queue payload so that if the process is
		// killed between the two writes, setQueueStore sees active=false and skips restoration
		// even though the queue payload still has tracks
		void this.queueStore?.storeString(playbackActiveKey, 'false').catch(() => {});
		this.persistQueue();
		this.notify();
	}

	playTracks(tracks: Array<Track>, startIndex = 0): void {
		const sanitizedTracks = sanitizeTracks(tracks);
		const clampedIndex = Math.max(0, Math.min(sanitizedTracks.length - 1, startIndex));
		this.queueRestoreSuperseded = true;
		this.allowBackwardRebuild = true;
		this.tracks = sanitizedTracks;
		this.album = null;
		this.trackIndex = clampedIndex;
		this.isPlaying = true;
		this.progressSeconds = 0;
		this._artistLogoUrls = [];
		void this.queueStore?.storeString(playbackActiveKey, 'true').catch(() => {});
		this.persistQueue();
		this.notify();
	}

	playWithArtistLogos(tracks: Array<Track>, logoUrls: Array<string | null>, startIndex = 0): void {
		const sanitizedTracks = sanitizeTracks(tracks);
		const clampedIndex = Math.max(0, Math.min(sanitizedTracks.length - 1, startIndex));
		this.queueRestoreSuperseded = true;
		this.allowBackwardRebuild = true;
		this.tracks = sanitizedTracks;
		this.album = null;
		this.trackIndex = clampedIndex;
		this.isPlaying = true;
		this.progressSeconds = 0;
		this._artistLogoUrls = tracks.map((_, index) => logoUrls[index] ?? null);
		void this.queueStore?.storeString(playbackActiveKey, 'true').catch(() => {});
		this.persistQueue();
		this.notify();
	}

	addToQueue(tracks: Array<Track>): void {
		this.tracks = [...this.tracks, ...sanitizeTracks(tracks)];
		this._artistLogoUrls = [...this._artistLogoUrls, ...tracks.map(() => null)];
		this.persistQueue();
		this.notify();
	}

	playNext(tracks: Array<Track>): void {
		if (this.tracks.length === 0) {
			this.playTracks(tracks, 0);
			return;
		}

		const insertAt = this.trackIndex + 1;
		const sanitized = sanitizeTracks(tracks);
		this.tracks = [...this.tracks.slice(0, insertAt), ...sanitized, ...this.tracks.slice(insertAt)];
		this._artistLogoUrls = [
			...this._artistLogoUrls.slice(0, insertAt),
			...tracks.map(() => null),
			...this._artistLogoUrls.slice(insertAt),
		];
		this.persistQueue();
		this.notify();
	}

	removeFromQueueAt(index: number): void {
		if (index < 0 || index >= this.tracks.length) {
			return;
		}

		if (this.tracks.length === 1) {
			this.stop();
			return;
		}

		this.allowBackwardRebuild = true;
		this.tracks = [...this.tracks.slice(0, index), ...this.tracks.slice(index + 1)];
		this._artistLogoUrls = [
			...this._artistLogoUrls.slice(0, index),
			...this._artistLogoUrls.slice(index + 1),
		];

		const wasCurrentTrack = index === this.trackIndex;

		if (index < this.trackIndex) {
			this.trackIndex -= 1;
		}

		if (this.trackIndex >= this.tracks.length) {
			this.trackIndex = Math.max(0, this.tracks.length - 1);
			this.progressSeconds = 0;
			this.seekTarget = null;
		} else if (wasCurrentTrack) {
			this.progressSeconds = 0;
			this.seekTarget = null;
		}

		this.persistQueue();
		this.notify();
	}

	moveQueueTrack(fromIndex: number, toIndex: number): void {
		if (
			fromIndex < 0 ||
			fromIndex >= this.tracks.length ||
			toIndex < 0 ||
			toIndex >= this.tracks.length ||
			fromIndex === toIndex
		) {
			return;
		}

		const movedTrack = this.tracks[fromIndex];
		const movedLogoUrl = this._artistLogoUrls[fromIndex] ?? null;

		const nextTracks = [...this.tracks];
		nextTracks.splice(fromIndex, 1);
		nextTracks.splice(toIndex, 0, movedTrack);
		this.tracks = nextTracks;

		const nextLogoUrls = [...this._artistLogoUrls];
		nextLogoUrls.splice(fromIndex, 1);
		nextLogoUrls.splice(toIndex, 0, movedLogoUrl);
		this._artistLogoUrls = nextLogoUrls;

		if (this.trackIndex === fromIndex) {
			this.trackIndex = toIndex;
		} else if (fromIndex < this.trackIndex && toIndex >= this.trackIndex) {
			this.trackIndex -= 1;
		} else if (fromIndex > this.trackIndex && toIndex <= this.trackIndex) {
			this.trackIndex += 1;
		}

		this.persistQueue();
		this.notify();
	}

	shuffle(): void {
		const start = this.trackIndex + 1;
		const tail = this.tracks.slice(start);
		const tailLogoUrls = this._artistLogoUrls.slice(start);
		for (let i = tail.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[tail[i], tail[j]] = [tail[j], tail[i]];
			[tailLogoUrls[i], tailLogoUrls[j]] = [tailLogoUrls[j], tailLogoUrls[i]];
		}
		this.tracks = [...this.tracks.slice(0, start), ...tail];
		this._artistLogoUrls = [...this._artistLogoUrls.slice(0, start), ...tailLogoUrls];
		this.persistQueue();
		this.notify();
	}

	private persistQueue(): void {
		if (!this.queueStore) {
			return;
		}

		const payload: PersistedPlaybackQueue = {
			album: this.album,
			artistLogoUrls: this._artistLogoUrls,
			progressSeconds: this.progressSeconds,
			trackIndex: this.trackIndex,
			tracks: this.tracks,
		};
		this.lastPersistedProgressSeconds = this.progressSeconds;

		void this.queueStore.storeString(playbackQueueCacheKey, JSON.stringify(payload)).catch(() => {
			// best effort persistence
		});
	}

	setArtistLogoUrl(url: string | null): void {
		if (this.tracks.length === 0) {
			this._artistLogoUrls = [];
			this.notify();
			return;
		}

		const currentTrack = this.track;
		const currentArtistId = currentTrack?.artistId ?? this.album?.artistId ?? null;

		this._artistLogoUrls = this.tracks.map((track, index) => {
			if (index === this.trackIndex) {
				return url;
			}

			if (currentArtistId != null && track.artistId === currentArtistId) {
				return url;
			}

			return this._artistLogoUrls[index] ?? null;
		});
		this.persistQueue();
		this.notify();
	}

	// coalesces every notify() inside fn into a single notification fired once fn returns.
	// used when reconciling buffered native events on wake so the store advances straight to
	// the final track in one update; without it each buffered completion notifies subscribers
	// (and reconfigures the native player) through every intermediate track, audible as skipping
	runBatched(fn: () => void): void {
		this.notifySuspendDepth += 1;
		try {
			fn();
		} finally {
			this.notifySuspendDepth -= 1;
			if (this.notifySuspendDepth === 0 && this.notifyPendingDuringSuspend) {
				this.notifyPendingDuringSuspend = false;
				this.notify();
			}
		}
	}

	private notify(): void {
		if (this.notifySuspendDepth > 0) {
			this.notifyPendingDuringSuspend = true;
			return;
		}
		for (const listener of [...this.listeners]) {
			listener();
		}
	}
}

function isPersistedPlaybackQueue(value: unknown): value is PersistedPlaybackQueue {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const candidate = value as Partial<PersistedPlaybackQueue>;
	if (!Array.isArray(candidate.tracks) || !candidate.tracks.every(isTrack)) {
		return false;
	}

	if (!Array.isArray(candidate.artistLogoUrls)) {
		return false;
	}

	if (!candidate.artistLogoUrls.every((entry) => entry == null || typeof entry === 'string')) {
		return false;
	}

	if (typeof candidate.trackIndex !== 'number') {
		return false;
	}

	if (
		candidate.progressSeconds != null &&
		(typeof candidate.progressSeconds !== 'number' || !Number.isFinite(candidate.progressSeconds))
	) {
		return false;
	}

	if (candidate.album != null && !isAlbum(candidate.album)) {
		return false;
	}

	return true;
}

function isAlbum(value: unknown): value is Album {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const candidate = value as Partial<Album>;
	return (
		typeof candidate.id === 'string' &&
		typeof candidate.name === 'string' &&
		typeof candidate.artistId === 'string' &&
		typeof candidate.artistName === 'string'
	);
}
