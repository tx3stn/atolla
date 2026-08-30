import type { Album } from 'atolla_core/src/models/Album';
import type { Artist } from 'atolla_core/src/models/Artist';
import type { Genre } from 'atolla_core/src/models/Genre';
import type { Playlist } from 'atolla_core/src/models/Playlist';
import type { Track } from 'atolla_core/src/models/Track';
import { getLogger } from 'atolla_core/src/services/Logger';
import type { Transport } from 'atolla_core/src/transports/Transport';
import { TRACK_PAGE_SIZE } from 'atolla_core/src/utils/Pagination';
import type { AddTracksToPlaylistParams, ArtworkRefresh } from './DownloadService';
import {
	type DownloadTrackResolverTransport,
	resolveDownloadTracks,
} from './DownloadTrackResolver';

// safety bound so a runaway paginating endpoint can't loop forever
const MAX_PAGES = 100;

export interface DownloadSyncTarget {
	addTracksToPlaylist(params: AddTracksToPlaylistParams): void;
	getAllAlbums(): Array<{ album: Album }>;
	getAllArtists(): Array<{ artist: Artist }>;
	getAllGenres(): Array<{ genre: Genre }>;
	getAllPlaylists(): Array<{ playlist: Playlist; trackIds: ReadonlyArray<string> }>;
	getDownloadingCount(): number;
	refreshArtwork(refresh: ArtworkRefresh): void;
}

export interface DownloadSyncTransport extends DownloadTrackResolverTransport {
	getArtistsByIds: Transport['getArtistsByIds'];
	getGenre: Transport['getGenre'];
	getPlaylist: Transport['getPlaylist'];
	getTracksByPlaylist: Transport['getTracksByPlaylist'];
}

export interface DownloadSyncDeps {
	downloadService: DownloadSyncTarget;
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function selectNewTracks(
	serverTracks: ReadonlyArray<Track>,
	snapshotIds: ReadonlyArray<string>,
): Array<Track> {
	const known = new Set(snapshotIds);
	const seen = new Set<string>();
	const result: Array<Track> = [];
	for (const track of serverTracks) {
		if (known.has(track.id) || seen.has(track.id)) continue;
		seen.add(track.id);
		result.push(track);
	}
	return result;
}

export class DownloadSyncService {
	private readonly deps: DownloadSyncDeps;
	private readonly log = getLogger('DownloadSyncService');
	private running: Promise<void> | null = null;

	constructor(deps: DownloadSyncDeps) {
		this.deps = deps;
	}

	syncAll(transport: DownloadSyncTransport): Promise<void> {
		if (this.running) {
			return this.running;
		}
		this.running = this.run(transport).finally(() => {
			this.running = null;
		});
		return this.running;
	}

	private async run(transport: DownloadSyncTransport): Promise<void> {
		const playlists = this.deps.downloadService.getAllPlaylists();

		// sequential and gentle on the server; the download queue provides the real
		// parallelism for the actual file downloads
		for (const entry of playlists) {
			try {
				await this.syncPlaylist(transport, entry.playlist, entry.trackIds);
			} catch (error) {
				this.log.warn('playlist sync failed', {
					id: entry.playlist.id,
					message: messageOf(error),
				});
			}
		}

		try {
			await this.refreshArtwork(
				transport,
				playlists.map((entry) => entry.playlist.id),
			);
		} catch (error) {
			this.log.warn('artwork refresh failed', { message: messageOf(error) });
		}
	}

	// downloaded entries hold the artwork urls they were captured with, and offline reads them
	// directly, so replaced art never reaches a download and its stale tag makes the native cache
	// drop bytes a later online browse had refreshed. re-read the current urls and write them back
	private async refreshArtwork(
		transport: DownloadSyncTransport,
		playlistIds: ReadonlyArray<string>,
	): Promise<void> {
		const downloads = this.deps.downloadService;
		// artwork is background maintenance: it queues images onto the same queue an in-flight
		// download is already saturating, so let the download finish and pick this up next pass
		if (downloads.getDownloadingCount() > 0) {
			return;
		}

		const albumIds = downloads.getAllAlbums().map((entry) => entry.album.id);
		const artistIds = downloads.getAllArtists().map((entry) => entry.artist.id);
		const genreIds = downloads.getAllGenres().map((entry) => entry.genre.id);
		if (albumIds.length + artistIds.length + genreIds.length + playlistIds.length === 0) {
			return;
		}

		const [albums, artists] = await Promise.all([
			albumIds.length > 0 ? transport.getAlbumsByIds(albumIds) : Promise.resolve([]),
			artistIds.length > 0 ? transport.getArtistsByIds(artistIds) : Promise.resolve([]),
		]);

		// no by-ids endpoint for these two, but a download library holds few of each
		const genres = await this.resolveEach(genreIds, (id) => transport.getGenre(id), 'genre');
		const playlists = await this.resolveEach(
			playlistIds,
			(id) => transport.getPlaylist(id),
			'playlist',
		);

		downloads.refreshArtwork({ albums, artists, genres, playlists });
	}

	private async resolveEach<T>(
		ids: ReadonlyArray<string>,
		resolve: (id: string) => PromiseLike<T | null>,
		label: string,
	): Promise<Array<T>> {
		const resolved: Array<T> = [];
		for (const id of ids) {
			try {
				const item = await resolve(id);
				if (item) {
					resolved.push(item);
				}
			} catch (error) {
				this.log.warn(`${label} artwork refresh failed`, { id, message: messageOf(error) });
			}
		}
		return resolved;
	}

	private async fetchAllTracks(
		fetchPage: (page: number) => PromiseLike<{ hasMore: boolean; items: Array<Track> }>,
	): Promise<Array<Track>> {
		const all: Array<Track> = [];
		let page = 1;
		let hasMore = true;
		while (hasMore && page <= MAX_PAGES) {
			const result = await fetchPage(page);
			all.push(...result.items);
			hasMore = result.hasMore;
			page += 1;
		}

		return all;
	}

	private async syncPlaylist(
		transport: DownloadSyncTransport,
		playlist: Playlist,
		snapshotIds: ReadonlyArray<string>,
	): Promise<void> {
		const serverTracks = await this.fetchAllTracks((page) =>
			transport.getTracksByPlaylist(playlist.id, page, TRACK_PAGE_SIZE),
		);
		const newTracks = selectNewTracks(serverTracks, snapshotIds);
		if (newTracks.length === 0) return;

		const { albums, artists, resolvedGenres, tracks } = await resolveDownloadTracks(
			transport,
			newTracks,
			{ resolveMissingLogos: true },
		);
		if (tracks.length === 0) return;
		this.deps.downloadService.addTracksToPlaylist({
			albums,
			artists,
			playlist,
			resolvedGenres,
			tracks,
		});
	}
}
