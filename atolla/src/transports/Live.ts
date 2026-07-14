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
import { version } from '../version';
import { TransportErrors } from './Errors';
import {
	type JellyfinImageResolvers,
	mapJellyfinAlbumToAlbum,
	mapJellyfinArtistToArtist,
	mapJellyfinGenreToGenre,
	mapJellyfinPlaylistToPlaylist,
	mapJellyfinTrackToTrack,
} from './JellyfinMappers';
import type { Transport } from './Transport';

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

const defaultPageSize = 100;
const defaultSearchLimit = 100;

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

	async addItemToPlaylist(playlistId: string, trackId: string): Promise<void> {
		await this.request('POST', `/Playlists/${encodeURIComponent(playlistId)}/Items`, {
			query: {
				ids: trackId,
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

	async getAlbumReleaseDates(
		page: number,
		pageSize: number,
	): Promise<{ hasMore: boolean; items: Array<{ id: string; releaseDate?: string }> }> {
		const startIndex = Math.max(0, page - 1) * pageSize;
		const list = await this.fetchItemsPage<JellyfinAlbumItem>({
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
		});

		return {
			hasMore: startIndex + list.Items.length < list.TotalRecordCount,
			items: list.Items.map((item) => ({ id: item.Id, releaseDate: item.PremiereDate })),
		};
	}

	async getAlbumsByArtist(artistId: string): Promise<Array<Album>> {
		const list = await this.fetchItemsPage<JellyfinAlbumItem>({
			albumArtistIds: artistId,
			fields: 'Overview,Genres',
			includeItemTypes: JellyfinMusicItemTypes.MusicAlbum,
			limit: defaultSearchLimit,
			recursive: true,
			sortBy: 'PremiereDate,SortName',
			sortOrder: 'Descending,Ascending',
			startIndex: 0,
		});

		return list.Items.map((item) => mapJellyfinAlbumToAlbum(item, this.imageResolvers));
	}

	async getAlbumsByIds(ids: Array<string>): Promise<Array<Album>> {
		const cleaned = ids.filter((id) => id.length > 0);
		if (cleaned.length === 0) {
			return [];
		}

		const list = await this.fetchItemsPage<JellyfinAlbumItem>({
			fields: 'Overview,Genres',
			ids: cleaned.join(','),
			includeItemTypes: JellyfinMusicItemTypes.MusicAlbum,
			limit: cleaned.length,
			recursive: true,
			startIndex: 0,
		});

		return list.Items.map((item) => mapJellyfinAlbumToAlbum(item, this.imageResolvers));
	}

	async getAlbums(
		page: number,
		pageSize: number,
		options?: { startsWith?: string },
	): Promise<AlbumsPageResult> {
		const startIndex = Math.max(0, page - 1) * pageSize;
		const list = await this.fetchItemsPage<JellyfinAlbumItem>({
			fields: 'Overview,Genres',
			includeItemTypes: JellyfinMusicItemTypes.MusicAlbum,
			limit: Math.max(1, pageSize),
			recursive: true,
			sortBy: 'PremiereDate,SortName',
			sortOrder: 'Descending,Ascending',
			startIndex,
			...nameFilterParams(options?.startsWith),
		});

		return {
			hasMore: startIndex + list.Items.length < list.TotalRecordCount,
			items: list.Items.map((item) => mapJellyfinAlbumToAlbum(item, this.imageResolvers)),
		};
	}

	async getArtist(artistId: string): Promise<Artist | null> {
		const item = await this.getItem<JellyfinArtistItem>(artistId);
		if (!item || item.Type !== JellyfinMusicItemTypes.MusicArtist) {
			return null;
		}

		return mapJellyfinArtistToArtist(item, this.imageResolvers);
	}

	async getArtistLogoUrl(artistId: string): Promise<string | null> {
		const item = await this.getItem<JellyfinArtistItem>(artistId);
		if (!item || item.Type !== JellyfinMusicItemTypes.MusicArtist) {
			return null;
		}

		const logoTag = item.ParentLogoImageTag ?? item.ImageTags?.Logo;
		if (!logoTag) {
			return null;
		}

		const logoItemId = item.ParentLogoItemId ?? item.Id;
		return this.buildItemImageUrl(logoItemId, 'Logo', logoTag);
	}

	async getArtists(
		page: number,
		pageSize: number,
		options?: { startsWith?: string },
	): Promise<{ hasMore: boolean; items: Array<Artist> }> {
		const startIndex = Math.max(0, page - 1) * pageSize;
		const list = await this.fetchItemsPage<JellyfinArtistItem>({
			includeItemTypes: JellyfinMusicItemTypes.MusicArtist,
			limit: Math.max(1, pageSize),
			recursive: true,
			sortBy: 'SortName',
			sortOrder: 'Ascending',
			startIndex,
			...nameFilterParams(options?.startsWith),
		});

		return {
			hasMore: startIndex + list.Items.length < list.TotalRecordCount,
			items: list.Items.map((item) => mapJellyfinArtistToArtist(item, this.imageResolvers)),
		};
	}

	async getArtistTopTracks(artistId: string): Promise<Array<Track>> {
		const list = await this.fetchItemsPage<JellyfinTrackItem>({
			artistIds: artistId,
			fields: 'Overview,MediaSources',
			includeItemTypes: JellyfinMusicItemTypes.Audio,
			limit: 5,
			recursive: true,
			sortBy: 'PlayCount,SortName',
			sortOrder: 'Descending,Ascending',
			startIndex: 0,
		});

		return list.Items.map((item) => mapJellyfinTrackToTrack(item, this.imageResolvers));
	}

	async getGenre(genreId: string): Promise<Genre | null> {
		const item = await this.getItem<JellyfinGenreItem>(genreId);
		if (!item || item.Type !== JellyfinMusicItemTypes.MusicGenre) {
			return null;
		}

		return mapJellyfinGenreToGenre(item, this.imageResolvers);
	}

	async getGenres(
		page: number,
		pageSize: number,
	): Promise<{ hasMore: boolean; items: Array<Genre> }> {
		const startIndex = Math.max(0, page - 1) * pageSize;
		const list = await this.requestJson<JellyfinListEnvelope<JellyfinGenreItem>>(
			'GET',
			'/MusicGenres',
			{
				query: {
					fields: 'Overview',
					limit: Math.max(1, pageSize),
					sortBy: 'SortName',
					sortOrder: 'Ascending',
					startIndex,
					userId: this.userId,
				},
			},
		);

		return {
			hasMore: startIndex + list.Items.length < list.TotalRecordCount,
			items: list.Items.map((item) => mapJellyfinGenreToGenre(item, this.imageResolvers)),
		};
	}

	async getPlaylist(playlistId: string): Promise<Playlist | null> {
		const item = await this.getItem<JellyfinPlaylistItem>(playlistId);
		if (!item || item.Type !== JellyfinMusicItemTypes.Playlist) {
			return null;
		}

		return mapJellyfinPlaylistToPlaylist(item, this.imageResolvers);
	}

	async getPlaylists(
		page: number,
		pageSize: number,
		options?: { startsWith?: string },
	): Promise<{ hasMore: boolean; items: Array<Playlist> }> {
		const startIndex = Math.max(0, page - 1) * pageSize;
		const list = await this.fetchItemsPage<JellyfinPlaylistItem>({
			includeItemTypes: JellyfinMusicItemTypes.Playlist,
			limit: Math.max(1, pageSize),
			recursive: true,
			sortBy: 'SortName',
			sortOrder: 'Ascending',
			startIndex,
			...nameFilterParams(options?.startsWith),
		});

		return {
			hasMore: startIndex + list.Items.length < list.TotalRecordCount,
			items: list.Items.map((item) => mapJellyfinPlaylistToPlaylist(item, this.imageResolvers)),
		};
	}

	async getRandomAlbum(): Promise<Album | null> {
		const list = await this.fetchItemsPage<JellyfinAlbumItem>({
			fields: 'Overview,Genres',
			includeItemTypes: JellyfinMusicItemTypes.MusicAlbum,
			limit: 1,
			recursive: true,
			sortBy: 'Random',
			startIndex: 0,
		});

		const item = list.Items[0];
		return item ? mapJellyfinAlbumToAlbum(item, this.imageResolvers) : null;
	}

	async getRandomMusicYears(limit: number): Promise<Array<number>> {
		const years = await this.requestJson<JellyfinListEnvelope<JellyfinYearItem>>('GET', '/Years', {
			query: {
				includeItemTypes: JellyfinMusicItemTypes.Audio,
				limit: Math.max(1, limit),
				mediaTypes: 'Audio',
				recursive: true,
				sortBy: 'Random',
				userId: this.userId,
			},
		});

		const result: Array<number> = [];
		for (const item of years.Items ?? []) {
			const year = item.ProductionYear ?? Number.parseInt(item.Name ?? '', 10);
			if (year && !Number.isNaN(year)) {
				result.push(year);
			}
		}
		return result;
	}

	async getRecentlyAddedAlbums(limit: number): Promise<Array<Album>> {
		const list = await this.fetchItemsPage<JellyfinAlbumItem>({
			fields: 'DateCreated,Genres,Overview',
			includeItemTypes: JellyfinMusicItemTypes.MusicAlbum,
			limit: Math.max(1, limit),
			recursive: true,
			sortBy: 'DateCreated',
			sortOrder: 'Descending',
			startIndex: 0,
		});
		return list.Items.map((item) => mapJellyfinAlbumToAlbum(item, this.imageResolvers));
	}

	async getShuffledLibraryTracks(
		page: number,
		pageSize: number,
	): Promise<{ hasMore: boolean; items: Array<Track> }> {
		const startIndex = Math.max(0, page - 1) * pageSize;
		const list = await this.fetchItemsPage<JellyfinTrackItem>({
			fields: 'MediaSources',
			includeItemTypes: JellyfinMusicItemTypes.Audio,
			limit: Math.max(1, pageSize),
			recursive: true,
			sortBy: 'Random',
			startIndex,
		});

		return {
			hasMore: startIndex + list.Items.length < list.TotalRecordCount,
			items: list.Items.map((item) => mapJellyfinTrackToTrack(item, this.imageResolvers)),
		};
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

	async getTracksByAlbum(albumId: string): Promise<Array<Track>> {
		const list = await this.fetchItemsPage<JellyfinTrackItem>({
			fields: 'Overview,MediaSources',
			includeItemTypes: JellyfinMusicItemTypes.Audio,
			limit: 500,
			parentId: albumId,
			recursive: true,
			sortBy: 'IndexNumber,SortName',
			sortOrder: 'Ascending,Ascending',
			startIndex: 0,
		});

		return list.Items.map((item) => mapJellyfinTrackToTrack(item, this.imageResolvers));
	}

	async getTracksByArtist(artistId: string): Promise<Array<Track>> {
		const list = await this.fetchItemsPage<JellyfinTrackItem>({
			artistIds: artistId,
			fields: 'Overview,MediaSources',
			includeItemTypes: JellyfinMusicItemTypes.Audio,
			limit: 500,
			recursive: true,
			sortBy: 'PremiereDate,SortName',
			sortOrder: 'Descending,Ascending',
			startIndex: 0,
		});

		return list.Items.map((item) => mapJellyfinTrackToTrack(item, this.imageResolvers));
	}

	async getTracksByGenre(genreId: string): Promise<Array<Track>> {
		const items = await this.fetchAllItems<JellyfinTrackItem>({
			fields: 'Overview,MediaSources',
			genreIds: genreId,
			includeItemTypes: JellyfinMusicItemTypes.Audio,
			recursive: true,
			sortBy: 'SortName',
			sortOrder: 'Ascending',
		});

		return items.map((item) => mapJellyfinTrackToTrack(item, this.imageResolvers));
	}

	async getTracksByGenrePage(
		genreId: string,
		page: number,
		pageSize: number,
	): Promise<{ hasMore: boolean; items: Array<Track>; totalCount: number }> {
		const startIndex = Math.max(0, page - 1) * pageSize;
		const list = await this.fetchItemsPage<JellyfinTrackItem>({
			fields: 'Overview,MediaSources',
			genreIds: genreId,
			includeItemTypes: JellyfinMusicItemTypes.Audio,
			limit: Math.max(1, pageSize),
			recursive: true,
			sortBy: 'SortName',
			sortOrder: 'Ascending',
			startIndex,
		});

		return {
			hasMore: startIndex + list.Items.length < list.TotalRecordCount,
			items: list.Items.map((item) => mapJellyfinTrackToTrack(item, this.imageResolvers)),
			totalCount: list.TotalRecordCount,
		};
	}

	async getTracksByPlaylist(
		playlistId: string,
		page: number,
		pageSize: number,
	): Promise<{ hasMore: boolean; items: Array<Track>; totalCount: number }> {
		const startIndex = Math.max(0, page - 1) * pageSize;
		const list = await this.requestJson<JellyfinListEnvelope<JellyfinTrackItem>>(
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

		return {
			hasMore: startIndex + (list.Items ?? []).length < list.TotalRecordCount,
			items: (list.Items ?? []).map((item) => mapJellyfinTrackToTrack(item, this.imageResolvers)),
			totalCount: list.TotalRecordCount,
		};
	}

	async getTracksByYear(
		year: number,
		page: number,
		pageSize: number,
	): Promise<{ hasMore: boolean; items: Array<Track> }> {
		const startIndex = Math.max(0, page - 1) * pageSize;
		const list = await this.fetchItemsPage<JellyfinTrackItem>({
			fields: 'MediaSources',
			includeItemTypes: JellyfinMusicItemTypes.Audio,
			limit: Math.max(1, pageSize),
			recursive: true,
			sortBy: 'Random',
			startIndex,
			years: year,
		});

		return {
			hasMore: startIndex + list.Items.length < list.TotalRecordCount,
			items: list.Items.map((item) => mapJellyfinTrackToTrack(item, this.imageResolvers)),
		};
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

	async search(query: string): Promise<SearchResults> {
		const normalizedQuery = query.trim();
		if (!normalizedQuery) {
			return {
				albums: [],
				artists: [],
				playlists: [],
				tracks: [],
			};
		}

		const list = await this.fetchItemsPage<
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
		});

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
					artists.push(mapJellyfinArtistToArtist(item as JellyfinArtistItem, this.imageResolvers));
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

	private async fetchAllItems<TItem>(
		params: Record<string, string | number | boolean | undefined>,
	): Promise<Array<TItem>> {
		const items: Array<TItem> = [];
		let startIndex = 0;

		while (true) {
			const list = await this.fetchItemsPage<TItem>({
				...params,
				limit: defaultPageSize,
				startIndex,
			});

			const page = list.Items ?? [];
			items.push(...page);
			startIndex += page.length;

			if (startIndex >= list.TotalRecordCount || page.length === 0) {
				break;
			}
		}

		return items;
	}

	private fetchItemsPage<TItem>(
		params: Record<string, string | number | boolean | undefined>,
	): Promise<JellyfinListEnvelope<TItem>> {
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

	private getItem<TItem>(itemId: string): Promise<TItem | null> {
		return this.requestJson<TItem>('GET', `/Items/${encodeURIComponent(itemId)}`, {
			query: {
				fields: 'Overview',
				userId: this.userId,
			},
		}).catch((error) => {
			if (error === TransportErrors.LIVE_REQUEST_FAILED) {
				return null;
			}
			throw error;
		});
	}

	private normalizeBaseUrl(url: string): string {
		return url.replace(/\/+$/, '');
	}

	private async request(
		method: 'DELETE' | 'GET' | 'POST',
		path: string,
		options: RequestOptions = {},
	): Promise<HTTPResponse> {
		const requestPath = this.buildPath(path, options.query ?? {});
		const headers = this.createHeaders();

		let response: HTTPResponse;
		if (method === 'POST') {
			let body: Uint8Array | undefined;
			if (options.body) {
				headers['Content-Type'] = 'application/json';
				body = new TextEncoder().encode(JSON.stringify(options.body));
			}
			response = await this.client.post(requestPath, body, headers);
		} else if (method === 'DELETE') {
			response = await this.client.delete(requestPath, headers);
		} else {
			response = await this.client.get(requestPath, headers);
		}

		if (response.statusCode === 401) {
			throw AuthErrors.SESSION_EXPIRED;
		}
		if (response.statusCode < 200 || response.statusCode >= 300) {
			throw TransportErrors.LIVE_REQUEST_FAILED;
		}
		return response;
	}

	private async requestJson<T>(
		method: 'DELETE' | 'GET' | 'POST',
		path: string,
		options: RequestOptions = {},
	): Promise<T> {
		const response = await this.request(method, path, options);

		if (!response.body) {
			throw TransportErrors.LIVE_INVALID_RESPONSE;
		}

		try {
			return JSON.parse(new TextDecoder().decode(response.body)) as T;
		} catch {
			throw TransportErrors.LIVE_INVALID_RESPONSE;
		}
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
