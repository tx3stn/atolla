import type { Album } from '../models/Album';
import type { Track } from '../models/Track';

type PlaybackListener = () => void;

export class PlaybackStore {
	private listeners = new Set<PlaybackListener>();

	album: Album | null = null;
	artistLogoUrl: string | null = null;
	isPlaying: boolean = false;
	progressSeconds: number = 0;
	trackIndex: number = 0;
	tracks: Array<Track> = [];

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
		this.artistLogoUrl = null;
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

	stop(): void {
		this.tracks = [];
		this.album = null;
		this.artistLogoUrl = null;
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
		this.artistLogoUrl = null;
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
		this.artistLogoUrl = url;
		this.notify();
	}

	private notify(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}
}
