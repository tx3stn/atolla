import type { Album } from '../models/Album';
import type { Track } from '../models/Track';

type PlaybackListener = () => void;

export type LoopMode = 'none' | 'queue' | 'track';

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

	album: Album | null = null;
	isPlaying: boolean = false;
	loopMode: LoopMode = 'none';
	progressSeconds: number = 0;
	seekTarget: number | null = null;
	trackIndex: number = 0;
	tracks: Array<Track> = [];

	cycleLoopMode(): void {
		switch (this.loopMode) {
			case 'none':
				this.loopMode = 'queue';
				break;
			case 'queue':
				this.loopMode = 'track';
				break;
			default:
				this.loopMode = 'none';
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
		this.tracks = tracks;
		this.album = album;
		this.trackIndex = startIndex;
		this.isPlaying = true;
		this.progressSeconds = 0;
		this.seekTarget = null;
		this._artistLogoUrls = [];
		this.notify();
	}

	jumpToIndex(index: number): void {
		const clamped = Math.max(0, Math.min(this.tracks.length - 1, index));
		this.trackIndex = clamped;
		this.progressSeconds = 0;
		this.seekTarget = null;
		this.isPlaying = true;
		this.notify();
	}

	next(): void {
		this.trackIndex = Math.min(this.trackIndex + 1, this.tracks.length - 1);
		this.progressSeconds = 0;
		this.seekTarget = null;
		this.notify();
	}

	previous(): void {
		this.trackIndex = Math.max(this.trackIndex - 1, 0);
		this.progressSeconds = 0;
		this.seekTarget = null;
		this.notify();
	}

	playPause(): void {
		this.isPlaying = !this.isPlaying;
		this.notify();
	}

	updateProgress(seconds: number): void {
		const activeTrack = this.track;
		if (!activeTrack) return;

		this.seekTarget = null;

		if (seconds >= activeTrack.duration) {
			if (this.loopMode === 'track') {
				this.progressSeconds = 0;
				this.seekTarget = 0;
			} else if (this.trackIndex >= this.tracks.length - 1) {
				if (this.loopMode === 'queue' && this.tracks.length > 0) {
					this.trackIndex = 0;
					this.progressSeconds = 0;
					this.seekTarget = 0;
				} else {
					this.progressSeconds = activeTrack.duration;
					this.isPlaying = false;
				}
			} else {
				this.trackIndex += 1;
				this.progressSeconds = 0;
			}
		} else {
			this.progressSeconds = seconds;
		}
		this.notify();
	}

	seekTo(seconds: number): void {
		const activeTrack = this.track;
		if (!activeTrack) return;

		const clamped = Math.max(0, Math.min(activeTrack.duration, seconds));
		this.seekTarget = clamped;
		this.progressSeconds = clamped;
		this.notify();
	}

	skipForward(seconds = 10): void {
		this.seekTo(this.progressSeconds + seconds);
	}

	stop(): void {
		this.tracks = [];
		this.album = null;
		this._artistLogoUrls = [];
		this.isPlaying = false;
		this.progressSeconds = 0;
		this.trackIndex = 0;
		this.notify();
	}

	playTracks(tracks: Array<Track>, startIndex = 0): void {
		this.tracks = tracks;
		this.album = null;
		this.trackIndex = startIndex;
		this.isPlaying = true;
		this.progressSeconds = 0;
		this._artistLogoUrls = [];
		this.notify();
	}

	playWithArtistLogos(tracks: Array<Track>, logoUrls: Array<string | null>, startIndex = 0): void {
		this.tracks = tracks;
		this.album = null;
		this.trackIndex = startIndex;
		this.isPlaying = true;
		this.progressSeconds = 0;
		this._artistLogoUrls = tracks.map((_, index) => logoUrls[index] ?? null);
		this.notify();
	}

	setArtistLogoUrls(logoUrls: Array<string | null>): void {
		this._artistLogoUrls = this.tracks.map((_, index) => logoUrls[index] ?? null);
		this.notify();
	}

	addToQueue(tracks: Array<Track>): void {
		this.tracks = [...this.tracks, ...tracks];
		this._artistLogoUrls = [...this._artistLogoUrls, ...tracks.map(() => null)];
		this.notify();
	}

	playNext(tracks: Array<Track>): void {
		const insertAt = this.trackIndex + 1;
		this.tracks = [...this.tracks.slice(0, insertAt), ...tracks, ...this.tracks.slice(insertAt)];
		this._artistLogoUrls = [
			...this._artistLogoUrls.slice(0, insertAt),
			...tracks.map(() => null),
			...this._artistLogoUrls.slice(insertAt),
		];
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

		if (index < this.trackIndex) {
			this.trackIndex -= 1;
		}

		if (this.trackIndex >= this.tracks.length) {
			this.trackIndex = Math.max(0, this.tracks.length - 1);
			this.progressSeconds = 0;
			this.seekTarget = null;
		}

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
		this.notify();
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
		this.notify();
	}

	private notify(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}
}
