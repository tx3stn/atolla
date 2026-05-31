import type { Track } from '../../models/Track';
import type { PlaybackStore } from '../../stores/Playback';
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

export function syncArtistLogosForQueue(
	playbackStore: Pick<PlaybackStore, 'tracks' | 'setArtistLogoUrls'>,
	tracks: Array<Track>,
	transport: Pick<Transport, 'getArtistLogoUrl'>,
): Promise<void> {
	return resolveArtistLogoUrlsForTracks(tracks, transport).then((logoUrls) => {
		if (!isSameTrackQueue(playbackStore.tracks, tracks)) return;
		playbackStore.setArtistLogoUrls(logoUrls);
	});
}

type RandomAlbumTransport = Pick<Transport, 'getRandomAlbum' | 'getTracksByAlbum'>;

export async function getRandomAlbumTracks(transport: RandomAlbumTransport): Promise<Array<Track>> {
	const album = await transport.getRandomAlbum().catch(() => null);
	if (!album) {
		return [];
	}

	return transport.getTracksByAlbum(album.id);
}

type ShuffleLibraryTransport = Pick<Transport, 'getShuffledLibraryTracks'>;

export function buildShuffleLibraryQueue(
	transport: ShuffleLibraryTransport,
): Promise<Array<Track>> {
	return transport.getShuffledLibraryTracks().catch(() => []);
}
