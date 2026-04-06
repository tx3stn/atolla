import { TransportErrors } from '../errors/TransportErrors';
import type { Album } from '../models/Album';
import type { Artist } from '../models/Artist';
import type {
	JellyfinAlbumItem,
	JellyfinArtistItem,
	JellyfinListEnvelope,
	JellyfinPlaylistItem,
	JellyfinTrackItem,
} from '../models/jellyfin/Types';
import { JellyfinMusicItemTypes } from '../models/jellyfin/Types';
import type { Playlist } from '../models/Playlist';
import type { SearchResults } from '../models/Search';
import type { Track } from '../models/Track';
import {
	type JellyfinImageResolvers,
	mapJellyfinAlbumToAlbum,
	mapJellyfinArtistToArtist,
	mapJellyfinPlaylistToPlaylist,
	mapJellyfinTrackToTrack,
} from './JellyfinMappers';
import type { Transport } from './Transport';

declare const require: (moduleName: string) => {
	HTTPClient: new (baseUrl: string) => HTTPClientLike;
};

export {
	type JellyfinImageResolvers,
	mapJellyfinAlbumToAlbum,
	mapJellyfinArtistToArtist,
	mapJellyfinPlaylistToPlaylist,
	mapJellyfinTrackToTrack,
	resolvePrimaryArtist,
	runTimeTicksToSeconds,
} from './JellyfinMappers';

interface HTTPResponseLike {
	body?: Uint8Array;
	headers: Record<string, string>;
	statusCode: number;
}

function getHeaderValue(headers: Record<string, string>, key: string): string | null {
	const normalizedKey = key.toLowerCase();
	for (const [headerKey, headerValue] of Object.entries(headers)) {
		if (headerKey.toLowerCase() === normalizedKey) {
			return headerValue;
		}
	}
	return null;
}

interface HTTPClientLike {
	get(pathOrUrl: string, headers?: Record<string, string>): Promise<HTTPResponseLike>;
}

interface LiveTransportOptions {
	httpClientFactory?: (baseUrl: string) => HTTPClientLike;
	requestTimeoutMs?: number;
}

interface AlbumsPageResult {
	hasMore: boolean;
	items: Array<Album>;
}

const defaultPageSize = 100;
const defaultSearchLimit = 100;

function createClientHeader(accessToken?: string): string {
	const base = 'MediaBrowser Client="Atolla", Device="Atolla", DeviceId="atolla", Version="0.0.1"';
	if (!accessToken) {
		return base;
	}
	return `${base}, Token="${accessToken}"`;
}

export class LiveTransport implements Transport {
	private readonly baseUrl: string;
	private readonly httpClientFactory: (baseUrl: string) => HTTPClientLike;
	private readonly requestTimeoutMs: number;

	constructor(
		readonly serverUrl: string,
		readonly accessToken: string,
		readonly userId: string,
		options: LiveTransportOptions = {},
	) {
		this.baseUrl = this.normalizeBaseUrl(serverUrl);
		this.httpClientFactory =
			options.httpClientFactory ??
			((baseUrl: string) => {
				const { HTTPClient } = require('valdi_http/src/HTTPClient');
				return new HTTPClient(baseUrl) as unknown as HTTPClientLike;
			});
		this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
	}

	async getAlbumsPage(page: number, pageSize: number): Promise<AlbumsPageResult> {
		const startIndex = Math.max(0, page - 1) * pageSize;
		const list = await this.fetchItemsPage<JellyfinAlbumItem>({
			includeItemTypes: JellyfinMusicItemTypes.MusicAlbum,
			limit: Math.max(1, pageSize),
			recursive: true,
			sortBy: 'SortName',
			sortOrder: 'Ascending',
			startIndex,
		});

		return {
			hasMore: startIndex + list.Items.length < list.TotalRecordCount,
			items: list.Items.map((item) => mapJellyfinAlbumToAlbum(item, this.imageResolvers)),
		};
	}

	async getAllArtists(): Promise<Array<Artist>> {
		const items = await this.fetchAllItems<JellyfinArtistItem>({
			includeItemTypes: JellyfinMusicItemTypes.MusicArtist,
			recursive: true,
			sortBy: 'SortName',
			sortOrder: 'Ascending',
		});

		return items.map((item) => mapJellyfinArtistToArtist(item, this.imageResolvers));
	}

	async getArtistsPage(
		page: number,
		pageSize: number,
	): Promise<{ hasMore: boolean; items: Array<Artist> }> {
		const startIndex = Math.max(0, page - 1) * pageSize;
		const list = await this.fetchItemsPage<JellyfinArtistItem>({
			includeItemTypes: JellyfinMusicItemTypes.MusicArtist,
			limit: Math.max(1, pageSize),
			recursive: true,
			sortBy: 'SortName',
			sortOrder: 'Ascending',
			startIndex,
		});

		return {
			hasMore: startIndex + list.Items.length < list.TotalRecordCount,
			items: list.Items.map((item) => mapJellyfinArtistToArtist(item, this.imageResolvers)),
		};
	}

	async getAllAlbums(): Promise<Array<Album>> {
		const items = await this.fetchAllItems<JellyfinAlbumItem>({
			includeItemTypes: JellyfinMusicItemTypes.MusicAlbum,
			recursive: true,
			sortBy: 'SortName',
			sortOrder: 'Ascending',
		});

		return items.map((item) => mapJellyfinAlbumToAlbum(item, this.imageResolvers));
	}

	async getAlbumsByArtist(artistId: string): Promise<Array<Album>> {
		const list = await this.fetchItemsPage<JellyfinAlbumItem>({
			albumArtistIds: artistId,
			includeItemTypes: JellyfinMusicItemTypes.MusicAlbum,
			limit: defaultSearchLimit,
			recursive: true,
			sortBy: 'PremiereDate,SortName',
			sortOrder: 'Descending,Ascending',
			startIndex: 0,
		});

		return list.Items.map((item) => mapJellyfinAlbumToAlbum(item, this.imageResolvers));
	}

	async getAllPlaylists(): Promise<Array<Playlist>> {
		const items = await this.fetchAllItems<JellyfinPlaylistItem>({
			includeItemTypes: JellyfinMusicItemTypes.Playlist,
			recursive: true,
			sortBy: 'SortName',
			sortOrder: 'Ascending',
		});

		return items.map((item) => mapJellyfinPlaylistToPlaylist(item, this.imageResolvers));
	}

	async getPlaylistsPage(
		page: number,
		pageSize: number,
	): Promise<{ hasMore: boolean; items: Array<Playlist> }> {
		const startIndex = Math.max(0, page - 1) * pageSize;
		const list = await this.fetchItemsPage<JellyfinPlaylistItem>({
			includeItemTypes: JellyfinMusicItemTypes.Playlist,
			limit: Math.max(1, pageSize),
			recursive: true,
			sortBy: 'SortName',
			sortOrder: 'Ascending',
			startIndex,
		});

		return {
			hasMore: startIndex + list.Items.length < list.TotalRecordCount,
			items: list.Items.map((item) => mapJellyfinPlaylistToPlaylist(item, this.imageResolvers)),
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

	async getArtistTopTracks(artistId: string): Promise<Array<Track>> {
		const list = await this.fetchItemsPage<JellyfinTrackItem>({
			artistIds: artistId,
			includeItemTypes: JellyfinMusicItemTypes.Audio,
			limit: 5,
			recursive: true,
			sortBy: 'PlayCount,SortName',
			sortOrder: 'Descending,Ascending',
			startIndex: 0,
		});

		return list.Items.map((item) => mapJellyfinTrackToTrack(item, this.imageResolvers));
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

	async getTracksByAlbum(albumId: string): Promise<Array<Track>> {
		const list = await this.fetchItemsPage<JellyfinTrackItem>({
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
			includeItemTypes: JellyfinMusicItemTypes.Audio,
			limit: 500,
			recursive: true,
			sortBy: 'PremiereDate,SortName',
			sortOrder: 'Descending,Ascending',
			startIndex: 0,
		});

		return list.Items.map((item) => mapJellyfinTrackToTrack(item, this.imageResolvers));
	}

	async getTracksByPlaylist(playlistId: string): Promise<Array<Track>> {
		const list = await this.requestJson<JellyfinListEnvelope<JellyfinTrackItem>>(
			`/Playlists/${encodeURIComponent(playlistId)}/Items`,
			{
				fields: 'Overview',
				limit: 500,
				startIndex: 0,
				userId: this.userId,
			},
		);

		return (list.Items ?? []).map((item) => mapJellyfinTrackToTrack(item, this.imageResolvers));
	}

	getTrackCacheUrl(trackId: string): string | null {
		if (!trackId) {
			return null;
		}

		const path = this.buildPath(`/Audio/${encodeURIComponent(trackId)}/stream.mp3`, {
			api_key: this.accessToken,
			deviceId: 'atolla',
			static: true,
			userId: this.userId,
		});
		return `${this.baseUrl}${path}`;
	}

	downloadBinary(url: string): Promise<{ buffer: ArrayBuffer; mimeType: string } | null> {
		return this.requestBinaryWithRedirects(url, 5);
	}

	private async requestBinaryWithRedirects(
		url: string,
		remainingRedirects: number,
	): Promise<{ buffer: ArrayBuffer; mimeType: string } | null> {
		const split = splitAbsoluteUrl(url);
		if (!split) {
			throw new Error(`invalid download url: ${url}`);
		}

		const { baseUrl, pathWithQuery } = split;
		const client = this.httpClientFactory(baseUrl);

		const response = await this.runWithRequestTimeout(
			client.get(pathWithQuery, this.createBinaryHeaders()),
		);

		if (isRedirectStatus(response.statusCode)) {
			if (remainingRedirects <= 0) {
				throw new Error(`download redirect limit reached status=${response.statusCode}`);
			}

			const location = getHeaderValue(response.headers, 'location');
			if (!location) {
				throw new Error(`download redirect missing location status=${response.statusCode}`);
			}

			const nextUrl = resolveRedirectUrl(baseUrl, location);
			if (!nextUrl) {
				throw new Error(`download redirect invalid location status=${response.statusCode}`);
			}
			return this.requestBinaryWithRedirects(nextUrl, remainingRedirects - 1);
		}

		if (response.statusCode < 200 || response.statusCode >= 300 || !response.body) {
			const location = getHeaderValue(response.headers, 'location') ?? 'none';
			const contentType = getHeaderValue(response.headers, 'content-type') ?? 'none';
			const contentLength = getHeaderValue(response.headers, 'content-length') ?? 'none';
			const hasBody = response.body ? '1' : '0';
			throw new Error(
				`download missing body status=${response.statusCode} body=${hasBody} ct=${contentType} cl=${contentLength} loc=${location}`,
			);
		}

		const bytes = response.body;
		const buffer = bytes.buffer.slice(
			bytes.byteOffset,
			bytes.byteOffset + bytes.byteLength,
		) as ArrayBuffer;
		const mimeType = getHeaderValue(response.headers, 'content-type') ?? 'audio/mpeg';
		return { buffer, mimeType };
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

			items.push(...list.Items);
			startIndex += list.Items.length;

			if (startIndex >= list.TotalRecordCount || list.Items.length === 0) {
				break;
			}
		}

		return items;
	}

	private fetchItemsPage<TItem>(
		params: Record<string, string | number | boolean | undefined>,
	): Promise<JellyfinListEnvelope<TItem>> {
		return this.requestJson<JellyfinListEnvelope<TItem>>('/Items', {
			...params,
			fields: 'Overview',
			recursive: params.recursive ?? true,
			userId: this.userId,
		});
	}

	private getItem<TItem>(itemId: string): Promise<TItem | null> {
		return this.requestJson<TItem>(`/Items/${encodeURIComponent(itemId)}`, {
			fields: 'Overview',
			userId: this.userId,
		}).catch((error) => {
			if (error === TransportErrors.LIVE_REQUEST_FAILED) {
				return null;
			}
			throw error;
		});
	}

	private requestJson<T>(
		path: string,
		query: Record<string, string | number | boolean | undefined> = {},
	): Promise<T> {
		const client = this.httpClientFactory(this.baseUrl);
		const requestPath = this.buildPath(path, query);

		return this.runWithRequestTimeout(client.get(requestPath, this.createHeaders())).then(
			(response) => {
				if (response.statusCode < 200 || response.statusCode >= 300) {
					throw TransportErrors.LIVE_REQUEST_FAILED;
				}

				if (!response.body) {
					throw TransportErrors.LIVE_INVALID_RESPONSE;
				}

				try {
					return JSON.parse(new TextDecoder().decode(response.body)) as T;
				} catch {
					throw TransportErrors.LIVE_INVALID_RESPONSE;
				}
			},
		);
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

	private buildItemImageUrl(itemId: string, imageType: 'Logo' | 'Primary', tag?: string): string {
		const query: Record<string, string | undefined> = {
			api_key: this.accessToken,
			tag,
		};
		const path = this.buildPath(`/Items/${encodeURIComponent(itemId)}/Images/${imageType}`, query);
		return `${this.baseUrl}${path}`;
	}

	private createHeaders(): Record<string, string> {
		const authHeader = createClientHeader(this.accessToken);
		return {
			Accept: 'application/json',
			Authorization: authHeader,
			'X-Emby-Authorization': authHeader,
			'X-Emby-Token': this.accessToken,
		};
	}

	private createBinaryHeaders(): Record<string, string> {
		const authHeader = createClientHeader(this.accessToken);
		return {
			Accept: '*/*',
			Authorization: authHeader,
			'X-Emby-Authorization': authHeader,
			'X-Emby-Token': this.accessToken,
		};
	}

	private normalizeBaseUrl(url: string): string {
		return url.replace(/\/+$/, '');
	}

	private runWithRequestTimeout<T>(promise: Promise<T>): Promise<T> {
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				reject(TransportErrors.LIVE_REQUEST_FAILED);
			}, this.requestTimeoutMs);

			promise.then(
				(value) => {
					clearTimeout(timer);
					resolve(value);
				},
				(error) => {
					clearTimeout(timer);
					reject(error);
				},
			);
		});
	}

	private readonly imageResolvers: JellyfinImageResolvers = {
		albumPrimaryImageUrl: (albumId: string, imageTag?: string): string =>
			this.buildItemImageUrl(albumId, 'Primary', imageTag),
		itemLogoImageUrl: (itemId: string, imageTag?: string): string =>
			this.buildItemImageUrl(itemId, 'Logo', imageTag),
		itemPrimaryImageUrl: (itemId: string, imageTag?: string): string =>
			this.buildItemImageUrl(itemId, 'Primary', imageTag),
	};
}

function isRedirectStatus(statusCode: number): boolean {
	return (
		statusCode === 301 ||
		statusCode === 302 ||
		statusCode === 303 ||
		statusCode === 307 ||
		statusCode === 308
	);
}

function splitAbsoluteUrl(url: string): { baseUrl: string; pathWithQuery: string } | null {
	const trimmed = (url ?? '').trim();
	const match = /^(https?:\/\/[^/]+)(\/.*)?$/i.exec(trimmed);
	if (!match) {
		return null;
	}

	return {
		baseUrl: match[1],
		pathWithQuery: match[2] && match[2].length > 0 ? match[2] : '/',
	};
}

function resolveRedirectUrl(baseUrl: string, location: string): string | null {
	const trimmedLocation = (location ?? '').trim();
	if (!trimmedLocation) {
		return null;
	}

	if (/^https?:\/\//i.test(trimmedLocation)) {
		return trimmedLocation;
	}

	if (trimmedLocation.startsWith('/')) {
		return `${baseUrl}${trimmedLocation}`;
	}

	return `${baseUrl}/${trimmedLocation}`;
}
