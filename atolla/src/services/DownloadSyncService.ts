import type { Playlist } from '../models/Playlist';
import type { Track } from '../models/Track';
import type { Transport } from '../transports/Transport';
import { TRACK_PAGE_SIZE } from '../ui/pagination/Grid';
import type { AddTracksToPlaylistParams } from './DownloadService';
import {
	type DownloadTrackResolverTransport,
	resolveDownloadTracks,
} from './DownloadTrackResolver';
import { getLogger } from './Logger';

// safety bound so a runaway paginating endpoint can't loop forever
const MAX_PAGES = 100;

export interface DownloadSyncTarget {
	addTracksToPlaylist(params: AddTracksToPlaylistParams): void;
	getAllPlaylists(): Array<{ playlist: Playlist; trackIds: ReadonlyArray<string> }>;
}

export interface DownloadSyncTransport extends DownloadTrackResolverTransport {
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
		// sequential and gentle on the server; the download queue provides the real
		// parallelism for the actual file downloads
		for (const entry of this.deps.downloadService.getAllPlaylists()) {
			try {
				await this.syncPlaylist(transport, entry.playlist, entry.trackIds);
			} catch (error) {
				this.log.warn('playlist sync failed', {
					id: entry.playlist.id,
					message: messageOf(error),
				});
			}
		}
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

		const { artists, resolvedGenres, tracks } = await resolveDownloadTracks(transport, newTracks, {
			resolveMissingLogos: true,
		});
		if (tracks.length === 0) return;
		this.deps.downloadService.addTracksToPlaylist({ artists, playlist, resolvedGenres, tracks });
	}
}
