import type { CancelablePromise } from 'valdi_core/src/CancelablePromise';
import type { HTTPResponse } from 'valdi_http/src/HTTPTypes';
import type { IHTTPClient } from 'valdi_http/src/IHTTPClient';
import type { Album } from '../models/Album';
import type { Artist } from '../models/Artist';
import type { Genre } from '../models/Genre';
import type {
	JellyfinAlbumItem,
	JellyfinArtistItem,
	JellyfinGenreItem,
	JellyfinListEnvelope,
	JellyfinPlaylistItem,
	JellyfinTrackItem,
	JellyfinYearItem,
} from '../models/jellyfin/Types';
import { JellyfinMusicItemTypes } from '../models/jellyfin/Types';
import type { Playlist } from '../models/Playlist';
import type { SearchResults } from '../models/Search';
import type { Track } from '../models/Track';
import { AuthErrors } from '../services/AuthErrors';
import { getLogger } from '../services/Logger';
import { version } from '../version';
import { cancelable, tracked } from './Cancelable';
import { TransportErrors } from './Errors';
import {
	type JellyfinImageResolvers,
	mapJellyfinAlbumToAlbum,
	mapJellyfinArtistToArtist,
	mapJellyfinGenreToGenre,
	mapJellyfinPlaylistToPlaylist,
	mapJellyfinTrackToTrack,
} from './JellyfinMappers';
import type { TrackPageSort, Transport } from './Transport';

export {
	type JellyfinImageResolvers,
	mapJellyfinAlbumToAlbum,
	mapJellyfinArtistToArtist,
	mapJellyfinGenreToGenre,
	mapJellyfinPlaylistToPlaylist,
	mapJellyfinTrackToTrack,
	resolveAlbumArtist,
	resolvePrimaryArtist,
	runTimeTicksToSeconds,
} from './JellyfinMappers';

interface LiveTransportOptions {
	clientDeviceId?: string;
}

interface RequestOptions {
	body?: Record<string, unknown>;
	query?: Record<string, string | number | boolean | undefined>;
}

interface AlbumsPageResult {
	hasMore: boolean;
	items: Array<Album>;
}

const defaultSearchLimit = 100;

const log = getLogger('transport');

export class LiveTransport implements Transport {
	private readonly baseUrl: string;
	private readonly client: IHTTPClient;
	private readonly clientDeviceId: string;
	private readonly imageResolvers: JellyfinImageResolvers = {
		albumPrimaryImageUrl: (albumId: string, imageTag?: string): string =>
			this.buildItemImageUrl(albumId, 'Primary', imageTag),
		itemLogoImageUrl: (itemId: string, imageTag?: string): string =>
			this.buildItemImageUrl(itemId, 'Logo', imageTag),
		itemPrimaryImageUrl: (itemId: string, imageTag?: string): string =>
			this.buildItemImageUrl(itemId, 'Primary', imageTag),
	};
	constructor(
		readonly serverUrl: string,
		readonly accessToken: string,
		readonly userId: string,
		client: IHTTPClient,
		options: LiveTransportOptions = {},
	) {
		this.baseUrl = this.normalizeBaseUrl(serverUrl);
		this.client = client;
		this.clientDeviceId = normalizeClientDeviceId(options.clientDeviceId);
	}

	async addItemsToPlaylist(playlistId: string, trackIds: Array<string>): Promise<void> {
		if (trackIds.length === 0) return;
		await this.request('POST', `/Playlists/${encodeURIComponent(playlistId)}/Items`, {
			query: {
				ids: trackIds.join(','),
				userId: this.userId,
			},
		});
	}

	async createPlaylist(name: string, trackId?: string): Promise<Playlist> {
		const body: Record<string, unknown> = { MediaType: 'Audio', Name: name };
		if (trackId) body.Ids = [trackId];
		const result = await this.requestJson<{ Id: string }>('POST', '/Playlists', { body });
		// Fetch the full item to get ImageTags (Jellyfin generates the collage image
		// synchronously when the first track is provided). This gives us the correct
		// tagged imageUrl so the playlist cover can be cached for offline use.
		const item = await this.getItem<JellyfinPlaylistItem>(result.Id);
		if (item) {
			return mapJellyfinPlaylistToPlaylist(item, this.imageResolvers);
		}
		return { id: result.Id, name };
	}

	getAlbumReleaseDates(
		page: number,
		pageSize: number,
	): CancelablePromise<{ hasMore: boolean; items: Array<{ id: string; releaseDate?: string }> }> {
		return cancelable(async (canceler) => {
			const startIndex = Math.max(0, page - 1) * pageSize;
			const list = await tracked(
				canceler,
				this.fetchItemsPage<JellyfinAlbumItem>({
					enableImages: false,
					enableUserData: false,
					// Minimal projection for the On This Day discovery sweep: an empty
					// `fields` is dropped by buildPath, so the server returns only the base
					// item DTO (id + PremiereDate) with no heavy Overview/Genres payload.
					fields: '',
					includeItemTypes: JellyfinMusicItemTypes.MusicAlbum,
					limit: Math.max(1, pageSize),
					recursive: true,
					sortBy: 'PremiereDate',
					sortOrder: 'Descending',
					startIndex,
				}),
			);

			return {
				hasMore: startIndex + list.Items.length < list.TotalRecordCount,
				items: list.Items.map((item) => ({ id: item.Id, releaseDate: item.PremiereDate })),
			};
		});
	}

	getAlbumsByArtist(artistId: string): CancelablePromise<Array<Album>> {
		return cancelable(async (canceler) => {
			const list = await tracked(
				canceler,
				this.fetchItemsPage<JellyfinAlbumItem>({
					albumArtistIds: artistId,
					fields: 'Overview,Genres',
					includeItemTypes: JellyfinMusicItemTypes.MusicAlbum,
					limit: defaultSearchLimit,
					recursive: true,
					sortBy: 'PremiereDate,SortName',
					sortOrder: 'Descending,Ascending',
					startIndex: 0,
				}),
			);

			return list.Items.map((item) => mapJellyfinAlbumToAlbum(item, this.imageResolvers));
		});
	}

	getAlbumsByIds(ids: Array<string>): CancelablePromise<Array<Album>> {
		return cancelable(async (canceler) => {
			const cleaned = ids.filter((id) => id.length > 0);
			if (cleaned.length === 0) {
				return [];
			}

			const list = await tracked(
				canceler,
				this.fetchItemsPage<JellyfinAlbumItem>({
					fields: 'Overview,Genres',
					ids: cleaned.join(','),
					includeItemTypes: JellyfinMusicItemTypes.MusicAlbum,
					limit: cleaned.length,
					recursive: true,
					startIndex: 0,
				}),
			);

			return list.Items.map((item) => mapJellyfinAlbumToAlbum(item, this.imageResolvers));
		});
	}

	getAlbums(
		page: number,
		pageSize: number,
		options?: { startsWith?: string },
	): CancelablePromise<AlbumsPageResult> {
		return cancelable(async (canceler) => {
			const startIndex = Math.max(0, page - 1) * pageSize;
			const list = await tracked(
				canceler,
				this.fetchItemsPage<JellyfinAlbumItem>({
					fields: 'Overview,Genres',
					includeItemTypes: JellyfinMusicItemTypes.MusicAlbum,
					limit: Math.max(1, pageSize),
					recursive: true,
					sortBy: 'PremiereDate,SortName',
					sortOrder: 'Descending,Ascending',
					startIndex,
					...nameFilterParams(options?.startsWith),
				}),
			);

			return {
				hasMore: startIndex + list.Items.length < list.TotalRecordCount,
				items: list.Items.map((item) => mapJellyfinAlbumToAlbum(item, this.imageResolvers)),
			};
		});
	}

	getArtist(artistId: string): CancelablePromise<Artist | null> {
		return cancelable(async (canceler) => {
			const item = await tracked(canceler, this.getItem<JellyfinArtistItem>(artistId));
			if (!item || item.Type !== JellyfinMusicItemTypes.MusicArtist) {
				return null;
			}

			return mapJellyfinArtistToArtist(item, this.imageResolvers);
		});
	}

	getArtistLogoUrl(artistId: string): CancelablePromise<string | null> {
		return cancelable(async (canceler) => {
			const item = await tracked(canceler, this.getItem<JellyfinArtistItem>(artistId));
			if (!item || item.Type !== JellyfinMusicItemTypes.MusicArtist) {
				return null;
			}

			const logoTag = item.ParentLogoImageTag ?? item.ImageTags?.Logo;
			if (!logoTag) {
				return null;
			}

			const logoItemId = item.ParentLogoItemId ?? item.Id;
			return this.buildItemImageUrl(logoItemId, 'Logo', logoTag);
		});
	}

	getArtists(
		page: number,
		pageSize: number,
		options?: { startsWith?: string },
	): CancelablePromise<{ hasMore: boolean; items: Array<Artist> }> {
		return cancelable(async (canceler) => {
			const startIndex = Math.max(0, page - 1) * pageSize;
			const list = await tracked(
				canceler,
				this.fetchItemsPage<JellyfinArtistItem>({
					includeItemTypes: JellyfinMusicItemTypes.MusicArtist,
					limit: Math.max(1, pageSize),
					recursive: true,
					sortBy: 'SortName',
					sortOrder: 'Ascending',
					startIndex,
					...nameFilterParams(options?.startsWith),
				}),
			);

			return {
				hasMore: startIndex + list.Items.length < list.TotalRecordCount,
				items: list.Items.map((item) => mapJellyfinArtistToArtist(item, this.imageResolvers)),
			};
		});
	}

	getArtistTopTracks(artistId: string): CancelablePromise<Array<Track>> {
		return cancelable(async (canceler) => {
			const list = await tracked(
				canceler,
				this.fetchItemsPage<JellyfinTrackItem>({
					artistIds: artistId,
					fields: 'Overview,MediaSources',
					includeItemTypes: JellyfinMusicItemTypes.Audio,
					limit: 5,
					recursive: true,
					sortBy: 'PlayCount,SortName',
					sortOrder: 'Descending,Ascending',
					startIndex: 0,
				}),
			);

			return list.Items.map((item) => mapJellyfinTrackToTrack(item, this.imageResolvers));
		});
	}

	getGenre(genreId: string): CancelablePromise<Genre | null> {
		return cancelable(async (canceler) => {
			const item = await tracked(canceler, this.getItem<JellyfinGenreItem>(genreId));
			if (!item || item.Type !== JellyfinMusicItemTypes.MusicGenre) {
				return null;
			}

			return mapJellyfinGenreToGenre(item, this.imageResolvers);
		});
	}

	getGenres(
		page: number,
		pageSize: number,
	): CancelablePromise<{ hasMore: boolean; items: Array<Genre> }> {
		return cancelable(async (canceler) => {
			const startIndex = Math.max(0, page - 1) * pageSize;
			const list = await tracked(
				canceler,
				this.requestJson<JellyfinListEnvelope<JellyfinGenreItem>>('GET', '/MusicGenres', {
					query: {
						fields: 'Overview',
						limit: Math.max(1, pageSize),
						sortBy: 'SortName',
						sortOrder: 'Ascending',
						startIndex,
						userId: this.userId,
					},
				}),
			);

			return {
				hasMore: startIndex + list.Items.length < list.TotalRecordCount,
				items: list.Items.map((item) => mapJellyfinGenreToGenre(item, this.imageResolvers)),
			};
		});
	}

	getPlaylist(playlistId: string): CancelablePromise<Playlist | null> {
		return cancelable(async (canceler) => {
			const item = await tracked(canceler, this.getItem<JellyfinPlaylistItem>(playlistId));
			if (!item || item.Type !== JellyfinMusicItemTypes.Playlist) {
				return null;
			}

			return mapJellyfinPlaylistToPlaylist(item, this.imageResolvers);
		});
	}

	getPlaylists(
		page: number,
		pageSize: number,
		options?: { startsWith?: string },
	): CancelablePromise<{ hasMore: boolean; items: Array<Playlist> }> {
		return cancelable(async (canceler) => {
			const startIndex = Math.max(0, page - 1) * pageSize;
			const list = await tracked(
				canceler,
				this.fetchItemsPage<JellyfinPlaylistItem>({
					includeItemTypes: JellyfinMusicItemTypes.Playlist,
					limit: Math.max(1, pageSize),
					recursive: true,
					sortBy: 'SortName',
					sortOrder: 'Ascending',
					startIndex,
					...nameFilterParams(options?.startsWith),
				}),
			);

			return {
				hasMore: startIndex + list.Items.length < list.TotalRecordCount,
				items: list.Items.map((item) => mapJellyfinPlaylistToPlaylist(item, this.imageResolvers)),
			};
		});
	}

	getRandomAlbum(): CancelablePromise<Album | null> {
		return cancelable(async (canceler) => {
			const list = await tracked(
				canceler,
				this.fetchItemsPage<JellyfinAlbumItem>({
					fields: 'Overview,Genres',
					includeItemTypes: JellyfinMusicItemTypes.MusicAlbum,
					limit: 1,
					recursive: true,
					sortBy: 'Random',
					startIndex: 0,
				}),
			);

			const item = list.Items[0];
			return item ? mapJellyfinAlbumToAlbum(item, this.imageResolvers) : null;
		});
	}

	getRandomMusicYears(limit: number): CancelablePromise<Array<number>> {
		return cancelable(async (canceler) => {
			const years = await tracked(
				canceler,
				this.requestJson<JellyfinListEnvelope<JellyfinYearItem>>('GET', '/Years', {
					query: {
						includeItemTypes: JellyfinMusicItemTypes.Audio,
						limit: Math.max(1, limit),
						mediaTypes: 'Audio',
						recursive: true,
						sortBy: 'Random',
						userId: this.userId,
					},
				}),
			);

			const result: Array<number> = [];
			for (const item of years.Items ?? []) {
				const year = item.ProductionYear ?? Number.parseInt(item.Name ?? '', 10);
				if (year && !Number.isNaN(year)) {
					result.push(year);
				}
			}
			return result;
		});
	}

	getRecentlyAddedAlbums(limit: number): CancelablePromise<Array<Album>> {
		return cancelable(async (canceler) => {
			const list = await tracked(
				canceler,
				this.fetchItemsPage<JellyfinAlbumItem>({
					fields: 'DateCreated,Genres,Overview',
					includeItemTypes: JellyfinMusicItemTypes.MusicAlbum,
					limit: Math.max(1, limit),
					recursive: true,
					sortBy: 'DateCreated',
					sortOrder: 'Descending',
					startIndex: 0,
				}),
			);
			return list.Items.map((item) => mapJellyfinAlbumToAlbum(item, this.imageResolvers));
		});
	}

	getShuffledLibraryTracks(
		page: number,
		pageSize: number,
	): CancelablePromise<{ hasMore: boolean; items: Array<Track> }> {
		return cancelable(async (canceler) => {
			const startIndex = Math.max(0, page - 1) * pageSize;
			const list = await tracked(
				canceler,
				this.fetchItemsPage<JellyfinTrackItem>({
					fields: 'MediaSources',
					includeItemTypes: JellyfinMusicItemTypes.Audio,
					limit: Math.max(1, pageSize),
					recursive: true,
					sortBy: 'Random',
					startIndex,
				}),
			);

			return {
				hasMore: startIndex + list.Items.length < list.TotalRecordCount,
				items: list.Items.map((item) => mapJellyfinTrackToTrack(item, this.imageResolvers)),
			};
		});
	}

	getTrackCacheUrl(trackId: string): string | null {
		if (!trackId) {
			return null;
		}

		const path = this.buildPath(`/Audio/${encodeURIComponent(trackId)}/stream.mp3`, {
			deviceId: this.clientDeviceId,
			static: true,
			userId: this.userId,
		});
		return `${this.baseUrl}${path}`;
	}

	getTracksByAlbum(albumId: string): CancelablePromise<Array<Track>> {
		return cancelable(async (canceler) => {
			const list = await tracked(
				canceler,
				this.fetchItemsPage<JellyfinTrackItem>({
					fields: 'Overview,MediaSources',
					includeItemTypes: JellyfinMusicItemTypes.Audio,
					limit: 500,
					parentId: albumId,
					recursive: true,
					sortBy: 'IndexNumber,SortName',
					sortOrder: 'Ascending,Ascending',
					startIndex: 0,
				}),
			);

			return list.Items.map((item) => mapJellyfinTrackToTrack(item, this.imageResolvers));
		});
	}

	getTracksByArtist(artistId: string): CancelablePromise<Array<Track>> {
		return cancelable(async (canceler) => {
			const list = await tracked(
				canceler,
				this.fetchItemsPage<JellyfinTrackItem>({
					artistIds: artistId,
					fields: 'Overview,MediaSources',
					includeItemTypes: JellyfinMusicItemTypes.Audio,
					limit: 500,
					recursive: true,
					sortBy: 'PremiereDate,SortName',
					sortOrder: 'Descending,Ascending',
					startIndex: 0,
				}),
			);

			return list.Items.map((item) => mapJellyfinTrackToTrack(item, this.imageResolvers));
		});
	}

	getTracksByGenre(
		genreId: string,
		page: number,
		pageSize: number,
		options?: { sort?: TrackPageSort },
	): CancelablePromise<{ hasMore: boolean; items: Array<Track>; totalCount: number }> {
		return cancelable(async (canceler) => {
			const startIndex = Math.max(0, page - 1) * pageSize;
			const list = await tracked(
				canceler,
				this.fetchItemsPage<JellyfinTrackItem>({
					fields: 'Overview,MediaSources',
					genreIds: genreId,
					includeItemTypes: JellyfinMusicItemTypes.Audio,
					limit: Math.max(1, pageSize),
					recursive: true,
					sortBy: options?.sort === 'random' ? 'Random' : 'SortName',
					sortOrder: 'Ascending',
					startIndex,
				}),
			);

			return {
				hasMore: startIndex + list.Items.length < list.TotalRecordCount,
				items: list.Items.map((item) => mapJellyfinTrackToTrack(item, this.imageResolvers)),
				totalCount: list.TotalRecordCount,
			};
		});
	}

	getTracksByPlaylist(
		playlistId: string,
		page: number,
		pageSize: number,
		options?: { sort?: TrackPageSort },
	): CancelablePromise<{ hasMore: boolean; items: Array<Track>; totalCount: number }> {
		return cancelable(async (canceler) => {
			const startIndex = Math.max(0, page - 1) * pageSize;
			// /Playlists/{id}/Items always returns the playlist's own running order and ignores
			// sortBy, so a shuffle has to query the playlist as a parent folder instead
			const read =
				options?.sort === 'random'
					? this.fetchItemsPage<JellyfinTrackItem>({
							fields: 'Overview,Genres,MediaSources',
							includeItemTypes: JellyfinMusicItemTypes.Audio,
							limit: Math.max(1, pageSize),
							parentId: playlistId,
							recursive: true,
							sortBy: 'Random',
							startIndex,
						})
					: this.requestJson<JellyfinListEnvelope<JellyfinTrackItem>>(
							'GET',
							`/Playlists/${encodeURIComponent(playlistId)}/Items`,
							{
								query: {
									fields: 'Overview,Genres,MediaSources',
									limit: Math.max(1, pageSize),
									startIndex,
									userId: this.userId,
								},
							},
						);
			const list = await tracked(canceler, read);

			return {
				hasMore: startIndex + (list.Items ?? []).length < list.TotalRecordCount,
				items: (list.Items ?? []).map((item) => mapJellyfinTrackToTrack(item, this.imageResolvers)),
				totalCount: list.TotalRecordCount,
			};
		});
	}

	getTracksByYear(
		year: number,
		page: number,
		pageSize: number,
	): CancelablePromise<{ hasMore: boolean; items: Array<Track> }> {
		return cancelable(async (canceler) => {
			const startIndex = Math.max(0, page - 1) * pageSize;
			const list = await tracked(
				canceler,
				this.fetchItemsPage<JellyfinTrackItem>({
					fields: 'MediaSources',
					includeItemTypes: JellyfinMusicItemTypes.Audio,
					limit: Math.max(1, pageSize),
					recursive: true,
					sortBy: 'Random',
					startIndex,
					years: year,
				}),
			);

			return {
				hasMore: startIndex + list.Items.length < list.TotalRecordCount,
				items: list.Items.map((item) => mapJellyfinTrackToTrack(item, this.imageResolvers)),
			};
		});
	}

	async movePlaylistTrack(playlistId: string, entryId: string, toIndex: number): Promise<void> {
		await this.request(
			'POST',
			`/Playlists/${encodeURIComponent(playlistId)}/Items/${encodeURIComponent(entryId)}/Move/${toIndex}`,
		);
	}

	async removePlaylistTrack(playlistId: string, entryId: string): Promise<void> {
		await this.request('DELETE', `/Playlists/${encodeURIComponent(playlistId)}/Items`, {
			query: {
				entryIds: entryId,
			},
		});
	}

	async scrobbleTrackPlayed(trackId: string, datePlayed: string): Promise<void> {
		if (!trackId || !datePlayed) {
			throw TransportErrors.LIVE_REQUEST_FAILED;
		}

		await this.request('POST', `/UserPlayedItems/${encodeURIComponent(trackId)}`, {
			query: {
				datePlayed,
				userId: this.userId,
			},
		});
	}

	search(query: string): CancelablePromise<SearchResults> {
		return cancelable(async (canceler) => {
			const normalizedQuery = query.trim();
			if (!normalizedQuery) {
				return {
					albums: [],
					artists: [],
					playlists: [],
					tracks: [],
				};
			}

			const list = await tracked(
				canceler,
				this.fetchItemsPage<
					JellyfinAlbumItem | JellyfinArtistItem | JellyfinPlaylistItem | JellyfinTrackItem
				>({
					fields: 'Overview,MediaSources',
					includeItemTypes: [
						JellyfinMusicItemTypes.MusicArtist,
						JellyfinMusicItemTypes.MusicAlbum,
						JellyfinMusicItemTypes.Playlist,
						JellyfinMusicItemTypes.Audio,
					].join(','),
					limit: defaultSearchLimit,
					recursive: true,
					searchTerm: normalizedQuery,
					sortBy: 'SortName',
					sortOrder: 'Ascending',
					startIndex: 0,
				}),
			);

			const albums: Array<Album> = [];
			const artists: Array<Artist> = [];
			const playlists: Array<Playlist> = [];
			const tracks: Array<Track> = [];

			for (const item of list.Items) {
				switch (item.Type) {
					case JellyfinMusicItemTypes.MusicAlbum:
						albums.push(mapJellyfinAlbumToAlbum(item as JellyfinAlbumItem, this.imageResolvers));
						break;
					case JellyfinMusicItemTypes.MusicArtist:
						artists.push(
							mapJellyfinArtistToArtist(item as JellyfinArtistItem, this.imageResolvers),
						);
						break;
					case JellyfinMusicItemTypes.Playlist:
						playlists.push(
							mapJellyfinPlaylistToPlaylist(item as JellyfinPlaylistItem, this.imageResolvers),
						);
						break;
					case JellyfinMusicItemTypes.Audio:
						tracks.push(mapJellyfinTrackToTrack(item as JellyfinTrackItem, this.imageResolvers));
						break;
				}
			}

			return { albums, artists, playlists, tracks };
		});
	}

	private buildItemImageUrl(itemId: string, imageType: 'Logo' | 'Primary', tag?: string): string {
		const query: Record<string, string | undefined> = { tag };
		const path = this.buildPath(`/Items/${encodeURIComponent(itemId)}/Images/${imageType}`, query);
		return `${this.baseUrl}${path}`;
	}

	private buildPath(
		path: string,
		query: Record<string, string | number | boolean | undefined>,
	): string {
		const params: Array<string> = [];
		for (const [key, value] of Object.entries(query)) {
			if (value === undefined || value === null || value === '') {
				continue;
			}
			params.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
		}
		const queryString = params.join('&');
		return queryString.length > 0 ? `${path}?${queryString}` : path;
	}

	private createHeaders(): Record<string, string> {
		const authHeader = createClientHeader(this.accessToken, this.clientDeviceId);
		const headers: Record<string, string> = {
			Accept: 'application/json',
			Authorization: authHeader,
			'X-Emby-Authorization': authHeader,
		};
		// only emit the token header when it's a non-empty string; a native header map
		// must never receive an undefined/null value
		if (this.accessToken) {
			headers['X-Emby-Token'] = this.accessToken;
		}
		return headers;
	}

	private fetchItemsPage<TItem>(
		params: Record<string, string | number | boolean | undefined>,
	): CancelablePromise<JellyfinListEnvelope<TItem>> {
		const fields = typeof params.fields === 'string' ? params.fields : 'Overview';
		return this.requestJson<JellyfinListEnvelope<TItem>>('GET', '/Items', {
			query: {
				...params,
				fields,
				recursive: params.recursive ?? true,
				userId: this.userId,
			},
		});
	}

	private getItem<TItem>(itemId: string): CancelablePromise<TItem | null> {
		return cancelable(async (canceler) => {
			try {
				return await tracked(
					canceler,
					this.requestJson<TItem>('GET', `/Items/${encodeURIComponent(itemId)}`, {
						query: {
							fields: 'Overview',
							userId: this.userId,
						},
					}),
				);
			} catch (error) {
				if (error === TransportErrors.LIVE_REQUEST_FAILED) {
					return null;
				}
				throw error;
			}
		});
	}

	private normalizeBaseUrl(url: string): string {
		return url.replace(/\/+$/, '');
	}

	private request(
		method: 'DELETE' | 'GET' | 'POST',
		path: string,
		options: RequestOptions = {},
	): CancelablePromise<HTTPResponse> {
		return cancelable(async (canceler) => {
			const requestPath = this.buildPath(path, options.query ?? {});
			const headers = this.createHeaders();

			let response: HTTPResponse;
			if (method === 'POST') {
				let body: Uint8Array | undefined;
				if (options.body) {
					headers['Content-Type'] = 'application/json';
					body = new TextEncoder().encode(JSON.stringify(options.body));
				}
				response = await tracked(canceler, this.client.post(requestPath, body, headers));
			} else if (method === 'DELETE') {
				response = await tracked(canceler, this.client.delete(requestPath, headers));
			} else {
				response = await tracked(canceler, this.client.get(requestPath, headers));
			}

			if (response.statusCode === 401) {
				log.warn('request rejected', { method, path: requestPath, status: 401 });
				throw AuthErrors.SESSION_EXPIRED;
			}
			if (response.statusCode < 200 || response.statusCode >= 300) {
				log.warn('request failed', {
					body: response.body ? new TextDecoder().decode(response.body).slice(0, 200) : undefined,
					method,
					path: requestPath,
					status: response.statusCode,
				});
				throw TransportErrors.LIVE_REQUEST_FAILED;
			}
			return response;
		});
	}

	private requestJson<T>(
		method: 'DELETE' | 'GET' | 'POST',
		path: string,
		options: RequestOptions = {},
	): CancelablePromise<T> {
		return cancelable(async (canceler) => {
			const response = await tracked(canceler, this.request(method, path, options));

			if (!response.body) {
				throw TransportErrors.LIVE_INVALID_RESPONSE;
			}

			try {
				return JSON.parse(new TextDecoder().decode(response.body)) as T;
			} catch {
				throw TransportErrors.LIVE_INVALID_RESPONSE;
			}
		});
	}
}

function createClientHeader(accessToken?: string, clientDeviceId = 'atolla'): string {
	const base = `MediaBrowser Client="atolla", Device="${clientDeviceId}", DeviceId="${clientDeviceId}", Version="${version}"`;
	if (!accessToken) {
		return base;
	}
	return `${base}, Token="${accessToken}"`;
}

// maps a library letter-filter token to Jellyfin `/Items` query params so prefix
// filtering happens server-side. letters a-z become `nameStartsWith`; the '0' bucket
// ("starts with a digit") maps to `nameLessThan: 'A'`, returning everything sorting
// before "A" (digits and symbols), which the client-side filter narrows to leading digits
function nameFilterParams(
	startsWith: string | undefined,
): Record<string, string | number | boolean | undefined> {
	const token = startsWith?.trim();
	if (!token) {
		return {};
	}
	if (token === '0') {
		return { nameLessThan: 'A' };
	}
	return { nameStartsWith: token };
}

function normalizeClientDeviceId(value: string | null | undefined): string {
	if (typeof value !== 'string') {
		return 'atolla';
	}

	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return 'atolla';
	}

	return trimmed.replace(/[^a-zA-Z0-9._-]/g, '_');
}
