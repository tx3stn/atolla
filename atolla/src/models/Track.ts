import type { Genre } from './Genre';

export interface Track {
	albumId?: string;
	albumImageUrl?: string;
	albumName?: string;
	artistId?: string;
	artistName?: string;
	audioFormat?: string;
	discNumber?: number;
	duration: number; // seconds
	genres?: Array<Genre>;
	id: string;
	name: string;
	playlistItemId?: string;
	productionYear?: number;
	releaseDate?: string;
	trackNumber?: number;
}

// Resolves the year a track was released, preferring the explicit production
// year and falling back to the leading YYYY of the release date. Returns null
// when neither is present so callers can skip undated tracks.
export function trackReleaseYear(track: Track): number | null {
	if (track.productionYear != null) {
		return track.productionYear;
	}
	if (track.releaseDate) {
		const year = Number.parseInt(track.releaseDate.slice(0, 4), 10);
		if (!Number.isNaN(year)) {
			return year;
		}
	}
	return null;
}

// Normalises fields that must be safe for the audio engine and UI layer.
// Apply at every track ingestion point (store, queue restore) so downstream
// code never has to guard against NaN durations or empty names.
// Preserves the original array and object references when no changes are needed.
export function sanitizeTracks(tracks: Array<Track>): Array<Track> {
	let changed = false;
	const result = tracks.map((t) => {
		const sanitized = sanitizeTrack(t);
		if (sanitized !== t) changed = true;
		return sanitized;
	});
	return changed ? result : tracks;
}

function sanitizeTrack(t: Track): Track {
	const name = t.name || 'Unknown';
	const duration = Number.isFinite(t.duration) && t.duration >= 0 ? t.duration : 0;
	if (name === t.name && duration === t.duration) {
		return t;
	}
	return { ...t, duration, name };
}
