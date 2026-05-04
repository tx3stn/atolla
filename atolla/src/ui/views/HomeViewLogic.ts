import type { Album } from '../../models/Album';
import type { Track } from '../../models/Track';
import { shuffleArray } from '../../stores/Playback';
import { type ConnectionMode, ConnectionModes } from '../../transports/Model';
import type { Transport } from '../../transports/Transport';

export function shouldApplyTransportAlbumsToHome(connectionMode: ConnectionMode): boolean {
	return connectionMode !== ConnectionModes.offline;
}

export function resolveArtistLogoUrlsForTracks(
	tracks: Array<Track>,
	transport: Pick<Transport, 'getArtistLogoUrl'>,
): Promise<Array<string | null>> {
	const logoRequestsByArtistId = new Map<string, Promise<string | null>>();

	return Promise.all(
		tracks.map((track) => {
			if (!track.artistId) {
				return Promise.resolve(null);
			}

			const existingRequest = logoRequestsByArtistId.get(track.artistId);
			if (existingRequest) {
				return existingRequest;
			}

			const request = transport.getArtistLogoUrl(track.artistId).catch(() => null);
			logoRequestsByArtistId.set(track.artistId, request);
			return request;
		}),
	);
}

export function isSameTrackQueue(
	currentTracks: Array<Track>,
	expectedTracks: Array<Track>,
): boolean {
	if (currentTracks.length !== expectedTracks.length) {
		return false;
	}

	return currentTracks.every((track, index) => track.id === expectedTracks[index]?.id);
}

type RandomAlbumTransport = Pick<Transport, 'getAllAlbums' | 'getTracksByAlbum'> & {
	getRandomAlbum?: () => Promise<Album | null>;
};

export async function getRandomAlbumTracks(
	transport: RandomAlbumTransport,
	pickAlbum: (albums: Array<Album>) => Album | null = (albums) => {
		if (albums.length === 0) return null;
		return albums[Math.floor(Math.random() * albums.length)] ?? null;
	},
): Promise<Array<Track>> {
	let album: Album | null = null;

	if (transport.getRandomAlbum) {
		album = await transport.getRandomAlbum().catch(() => null);
	}

	if (!album) {
		const albums = await transport.getAllAlbums();
		album = pickAlbum(albums);
	}

	if (!album) {
		return [];
	}

	return transport.getTracksByAlbum(album.id);
}

type ShuffleLibraryTransport = Pick<Transport, 'getAllAlbums' | 'getTracksByAlbum'> & {
	getShuffledLibraryTracks?: () => Promise<Array<Track>>;
};

export async function buildShuffleLibraryQueue(
	connectionMode: ConnectionMode,
	transport: ShuffleLibraryTransport,
	shuffleTracks: (tracks: Array<Track>) => Array<Track> = shuffleArray,
): Promise<Array<Track>> {
	if (connectionMode === ConnectionModes.online && transport.getShuffledLibraryTracks) {
		const remoteTracks = await transport.getShuffledLibraryTracks().catch(() => []);
		if (remoteTracks.length > 0) {
			return remoteTracks;
		}
	}

	const albums = await transport.getAllAlbums();
	if (albums.length === 0) {
		return [];
	}

	const trackLists = await Promise.all(albums.map((album) => transport.getTracksByAlbum(album.id)));
	const uniqueTracksById = new Map<string, Track>();
	for (const tracks of trackLists) {
		for (const track of tracks) {
			if (!uniqueTracksById.has(track.id)) {
				uniqueTracksById.set(track.id, track);
			}
		}
	}

	return shuffleTracks(Array.from(uniqueTracksById.values()));
}
