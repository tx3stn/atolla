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

// prefers productionYear, falls back to the leading YYYY of releaseDate; null when undated so callers can skip
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

// apply at every track ingestion point so downstream never guards against NaN durations or empty names; preserves references when unchanged
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

// minimal structural check used when validating persisted/untrusted track payloads
export function isTrack(value: unknown): value is Track {
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
