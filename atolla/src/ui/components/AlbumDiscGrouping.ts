import type { Track } from '../../models/Track';

export interface DiscGroup {
	disc: number | null;
	tracks: Array<Track>;
}

export interface DiscGrouping {
	groups: Array<DiscGroup>;
	multiDisc: boolean;
}

// Buckets tracks by their disc number so the album view can render a section per
// disc. Groups are ordered by disc ascending with the undisced group (if any)
// last, and track order within a disc is preserved from the input. `multiDisc`
// is true only when more than one distinct disc number is present, so a record
// with no disc info — or a single disc — renders as one plain list.
export function groupTracksByDisc(tracks: Array<Track>): DiscGrouping {
	const byDisc = new Map<number | null, Array<DiscGroup['tracks'][number]>>();

	for (const track of tracks) {
		const disc = track.discNumber ?? null;
		const bucket = byDisc.get(disc);
		if (bucket) {
			bucket.push(track);
		} else {
			byDisc.set(disc, [track]);
		}
	}

	const groups: Array<DiscGroup> = [...byDisc.entries()]
		.map(([disc, discTracks]) => ({ disc, tracks: discTracks }))
		.sort((a, b) => {
			if (a.disc === null) return 1;
			if (b.disc === null) return -1;
			return a.disc - b.disc;
		});

	const distinctDiscs = groups.filter((group) => group.disc !== null).length;

	return { groups, multiDisc: distinctDiscs > 1 };
}
