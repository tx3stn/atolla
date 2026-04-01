import type { Album } from '../models/Album';
import type { Track } from '../models/Track';

type PlaybackListener = () => void;

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
	private _artistLogoUrl: string | null = null;
	private _artistLogoUrls: Array<string | null> = [];

	album: Album | null = null;
	isPlaying: boolean = false;
	progressSeconds: number = 0;
	trackIndex: number = 0;
	tracks: Array<Track> = [];

	get artistLogoUrl(): string | null {
		return this._artistLogoUrls[this.trackIndex] ?? this._artistLogoUrl ?? null;
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
		this._artistLogoUrl = null;
		this._artistLogoUrls = [];
		this.notify();
	}

	jumpToIndex(index: number): void {
		const clamped = Math.max(0, Math.min(this.tracks.length - 1, index));
		this.trackIndex = clamped;
		this.progressSeconds = 0;
		this.isPlaying = true;
		this.notify();
	}

	next(): void {
		this.trackIndex = Math.min(this.trackIndex + 1, this.tracks.length - 1);
		this.progressSeconds = 0;
		this.notify();
	}

	previous(): void {
		this.trackIndex = Math.max(this.trackIndex - 1, 0);
		this.progressSeconds = 0;
		this.notify();
	}

	playPause(): void {
		this.isPlaying = !this.isPlaying;
		this.notify();
	}

	updateProgress(seconds: number): void {
		const activeTrack = this.track;
		if (!activeTrack) return;

		if (seconds >= activeTrack.duration) {
			if (this.trackIndex >= this.tracks.length - 1) {
				this.progressSeconds = activeTrack.duration;
				this.isPlaying = false;
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
		if (!activeTrack) {
			return;
		}

		const clamped = Math.max(0, Math.min(activeTrack.duration, seconds));
		this.progressSeconds = clamped;
		this.notify();
	}

	skipForward(seconds = 10): void {
		this.seekTo(this.progressSeconds + seconds);
	}

	stop(): void {
		this.tracks = [];
		this.album = null;
		this._artistLogoUrl = null;
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
		this._artistLogoUrl = null;
		this._artistLogoUrls = [];
		this.notify();
	}

	playWithArtistLogos(tracks: Array<Track>, logoUrls: Array<string | null>, startIndex = 0): void {
		this.tracks = tracks;
		this.album = null;
		this.trackIndex = startIndex;
		this.isPlaying = true;
		this.progressSeconds = 0;
		this._artistLogoUrl = null;
		this._artistLogoUrls = logoUrls;
		this.notify();
	}

	addToQueue(tracks: Array<Track>): void {
		this.tracks = [...this.tracks, ...tracks];
		this.notify();
	}

	playNext(tracks: Array<Track>): void {
		const insertAt = this.trackIndex + 1;
		this.tracks = [...this.tracks.slice(0, insertAt), ...tracks, ...this.tracks.slice(insertAt)];
		this.notify();
	}

	shuffle(): void {
		const start = this.trackIndex + 1;
		const tail = this.tracks.slice(start);
		for (let i = tail.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[tail[i], tail[j]] = [tail[j], tail[i]];
		}
		this.tracks = [...this.tracks.slice(0, start), ...tail];
		this.notify();
	}

	setArtistLogoUrl(url: string | null): void {
		this._artistLogoUrl = url;
		this._artistLogoUrls = [];
		this.notify();
	}

	private notify(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}
}
