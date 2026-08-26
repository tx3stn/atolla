import type { Album } from 'atolla_core/src/models/Album';
import type { Artist } from 'atolla_core/src/models/Artist';
import type { Genre } from 'atolla_core/src/models/Genre';
import type { Playlist } from 'atolla_core/src/models/Playlist';
import type { TrackPageSort, Transport } from 'atolla_core/src/transports/Transport';
import { singlePage, type TrackSource } from 'atolla_player/src/services/TrackSource';

export type EntityRef =
	| { album: Album; kind: 'album' }
	| { artist: Artist; kind: 'artist' }
	| { genre: Genre; kind: 'genre' }
	| { kind: 'playlist'; playlist: Playlist };

export interface EntityTrackOptions {
	sort?: TrackPageSort;
}

export function entityTrackSource(
	item: EntityRef,
	transport: Transport,
	options?: EntityTrackOptions,
): TrackSource {
	switch (item.kind) {
		case 'album':
			return singlePage(() => transport.getTracksByAlbum(item.album.id));
		case 'artist':
			return singlePage(() => transport.getTracksByArtist(item.artist.id));
		case 'genre':
			return (page, pageSize) => transport.getTracksByGenre(item.genre.id, page, pageSize, options);
		case 'playlist':
			return (page, pageSize) =>
				transport.getTracksByPlaylist(item.playlist.id, page, pageSize, options);
	}
}
