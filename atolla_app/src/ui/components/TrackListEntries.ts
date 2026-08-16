import type { Track } from '../../models/Track';
import type { TrackListEntry } from './TrackList';

export interface DerivedTracks {
	entries: Array<TrackListEntry>;
	totalDuration: number;
}

// the flat artist-subtitled list shape shared by the playlist and genre detail views
export function deriveTracks(tracks: Array<Track>): DerivedTracks {
	return {
		entries: tracks.map((track) => ({
			artworkSource: track.albumImageUrl ?? null,
			id: track.id,
			meta: track.artistName ?? '',
			title: track.name,
			track,
		})),
		totalDuration: tracks.reduce((sum, t) => sum + t.duration, 0),
	};
}
