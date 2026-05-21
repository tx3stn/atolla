import type { Album } from '../models/Album';
import { sanitizeTracks, type Track } from '../models/Track';
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

	album: Album | null = null;
	isPlaying: boolean = false;
	loopMode: LoopMode = LoopModes.none;
	progressSeconds: number = 0;
	seekTarget: number | null = null;
	trackIndex: number = 0;
	tracks: Array<Track> = [];

	async setQueueStore(
		store: PlaybackQueueStore | null,
		isPlayingFn?: () => boolean,
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
			// Restore as playing if the native player is actively running (process was alive
			// and playback continued in background). On a cold start the callback returns false.
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
		this.tracks = sanitizedTracks;
		this.album = album;
		this.trackIndex = clampedIndex;
		this.isPlaying = true;
		this.progressSeconds = 0;
		this.seekTarget = null;
		this._artistLogoUrls = [];
		// Clear inactive marker so the next cold start can restore this queue.
		void this.queueStore?.storeString(playbackActiveKey, 'true').catch(() => {});
		this.persistQueue();
		this.notify();
	}

	jumpToIndex(index: number): void {
		DebugLogger.log('PlaybackStore', 'jumpToIndex', { index, trackCount: this.tracks.length });
		this.queueRestoreSuperseded = true;
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
		this.trackIndex += 1;
		this.progressSeconds = 0;
		this.seekTarget = null;
		this.persistQueue();
		this.notify();
	}

	previous(): void {
		this.trackIndex = Math.max(this.trackIndex - 1, 0);
		this.progressSeconds = 0;
		this.seekTarget = null;
		this.persistQueue();
		this.notify();
	}

	playPause(): void {
		DebugLogger.log('PlaybackStore', 'playPause', {
			trackId: this.track?.id,
			wasPlaying: this.isPlaying,
		});
		this.isPlaying = !this.isPlaying;
		if (!this.isPlaying) {
			this.persistQueue();
		}
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
		// Update the persisted baseline so the 5-second step logic in updateProgress
		// doesn't immediately fire another persist when playback resumes after seeking.
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
		// Write the inactive marker before the full queue payload so that if the
		// process is killed between these two writes, setQueueStore will see active=false
		// and skip restoration even though the queue payload still has tracks.
		void this.queueStore?.storeString(playbackActiveKey, 'false').catch(() => {});
		this.persistQueue();
		this.notify();
	}

	playTracks(tracks: Array<Track>, startIndex = 0): void {
		const sanitizedTracks = sanitizeTracks(tracks);
		const clampedIndex = Math.max(0, Math.min(sanitizedTracks.length - 1, startIndex));
		this.queueRestoreSuperseded = true;
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

	setArtistLogoUrls(logoUrls: Array<string | null>): void {
		this._artistLogoUrls = this.tracks.map((_, index) => logoUrls[index] ?? null);
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

	private notify(): void {
		for (const listener of this.listeners) {
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

function isTrack(value: unknown): value is Track {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const candidate = value as Partial<Track>;
	return (
		typeof candidate.id === 'string' &&
		typeof candidate.name === 'string' &&
		typeof candidate.duration === 'number'
	);
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
