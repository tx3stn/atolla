// generates a wiretap static-mock tree from the app's typed Jellyfin fixtures.

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
	JellyfinAlbumItem,
	JellyfinBaseItemDto,
	JellyfinMediaSource,
	JellyfinTrackItem,
} from '../../atolla_app/src/models/jellyfin/Types';
import { mockJellyfinAlbums as rawAlbums, mockJellyfinTracks as rawTracks } from './mocks/Albums';
import { mockJellyfinArtists as rawArtists } from './mocks/Artists';
import { mockGenreTrackIds, mockJellyfinGenres as rawGenres } from './mocks/Genres';
import { mockJellyfinPlaylists as rawPlaylists } from './mocks/Playlists';

// jellyfin computes SortName per item — lowercased with leading articles stripped — and
// every name-ordered query and A-Z filter it serves runs off that column, not Name.
function withSortName<T extends JellyfinBaseItemDto>(item: T): T {
	const trimmed = item.Name.trim();
	return { ...item, SortName: trimmed.replace(/^(a|an|the)\s+/i, '').toLowerCase() };
}

const IMAGES_DIR = join(import.meta.dir, 'media', 'images');

// Logo tag only set when a logo file exists — without it the app shows the text fallback.
function withLogoTag<T extends JellyfinBaseItemDto>(artist: T): T {
	if (!existsSync(join(IMAGES_DIR, `${artist.Id}-logo.png`))) {
		return artist;
	}
	return { ...artist, ImageTags: { ...artist.ImageTags, Logo: 'mock' } };
}

const mockJellyfinAlbums = rawAlbums.map(withSortName);
const mockJellyfinArtists = rawArtists.map(withSortName).map(withLogoTag);
const mockJellyfinGenres = rawGenres.map(withSortName);
const mockJellyfinPlaylists = rawPlaylists.map(withSortName);
const mockJellyfinTracks = rawTracks.map(withSortName);

// the userId every /Users/... path and userId= param resolves to, because we control
// the auth response that hands it out
const USER_ID = 'atolla-user';

const OUT = join(import.meta.dir, 'generated');
const DEFINITIONS_DIR = join(OUT, 'mock-definitions');
const BODIES_DIR = join(OUT, 'body-jsons');

const formatCycle: Array<JellyfinMediaSource> = [
	{ MediaStreams: [{ BitDepth: 24, Codec: 'flac', SampleRate: 96000, Type: 'Audio' }] },
	{ MediaStreams: [{ BitDepth: 16, Codec: 'flac', SampleRate: 44100, Type: 'Audio' }] },
	{ MediaStreams: [{ BitRate: 320000, Codec: 'mp3', Type: 'Audio' }] },
	{ MediaStreams: [{ BitRate: 256000, Codec: 'aac', Type: 'Audio' }] },
	{ MediaStreams: [{ BitDepth: 24, Codec: 'flac', SampleRate: 44100, Type: 'Audio' }] },
	{ MediaStreams: [{ BitRate: 192000, Codec: 'vorbis', Type: 'Audio' }] },
];

function mediaSourcesForAlbum(albumId: string | undefined): Array<JellyfinMediaSource> {
	const num = albumId ? Number.parseInt(albumId.replace(/\D/g, ''), 10) : 0;
	return [formatCycle[(Number.isNaN(num) ? 0 : num) % formatCycle.length]];
}

function trackDto(track: JellyfinTrackItem): JellyfinTrackItem {
	return { ...track, MediaSources: mediaSourcesForAlbum(track.AlbumId) };
}

function parseTime(value: string | undefined): number | null {
	if (!value) return null;
	const time = Date.parse(value);
	return Number.isNaN(time) ? null : time;
}

function albumsDefaultOrder<T extends JellyfinBaseItemDto>(albums: Array<T>): Array<T> {
	return [...albums].sort((left, right) => {
		const leftTime = parseTime(left.PremiereDate);
		const rightTime = parseTime(right.PremiereDate);
		let byDate = 0;
		if (leftTime == null && rightTime == null) byDate = 0;
		else if (leftTime == null) byDate = 1;
		else if (rightTime == null) byDate = -1;
		else byDate = rightTime - leftTime;
		if (byDate !== 0) return byDate;
		return compareSortNames(left, right);
	});
}

function bySortName<T extends JellyfinBaseItemDto>(items: Array<T>): Array<T> {
	return [...items].sort(compareSortNames);
}

function compareSortNames(left: JellyfinBaseItemDto, right: JellyfinBaseItemDto): number {
	return (left.SortName ?? '').localeCompare(right.SortName ?? '');
}

function sortsBeforeA(item: JellyfinBaseItemDto): boolean {
	return (item.SortName ?? '') < 'a';
}

function startsWithLetter(item: JellyfinBaseItemDto, letter: string): boolean {
	return (item.SortName ?? '').startsWith(letter.toLowerCase());
}

function yearOf(track: JellyfinTrackItem): number | undefined {
	if (track.ProductionYear) return track.ProductionYear;
	if (track.PremiereDate) {
		const parsed = Number.parseInt(track.PremiereDate.slice(0, 4), 10);
		return Number.isNaN(parsed) ? undefined : parsed;
	}
	return undefined;
}

function envelope(items: Array<unknown>): unknown {
	return { Items: items, StartIndex: 0, TotalRecordCount: items.length };
}

function slug(value: string): string {
	return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

type Matcher = {
	method: 'GET' | 'POST' | 'DELETE';
	urlPath: string;
	queryParams?: Record<string, string>;
};

function get(urlPath: string, queryParams?: Record<string, string>): Matcher {
	return queryParams ? { method: 'GET', queryParams, urlPath } : { method: 'GET', urlPath };
}

function post(urlPath: string): Matcher {
	return { method: 'POST', urlPath };
}

let fixtureCount = 0;
const usedNames = new Set<string>();

function fixture(name: string, request: Matcher, body: unknown): void {
	if (usedNames.has(name)) {
		throw new Error(`duplicate fixture name: ${name}`);
	}
	usedNames.add(name);
	const bodyFile = `${name}.json`;
	writeFileSync(join(BODIES_DIR, bodyFile), `${JSON.stringify(body, null, 2)}\n`);
	writeFileSync(
		join(DEFINITIONS_DIR, `${name}.json`),
		`${JSON.stringify({ request, response: { bodyJsonFilename: bodyFile, statusCode: 200 } }, null, 2)}\n`,
	);
	fixtureCount++;
}

function reset(): void {
	rmSync(OUT, { force: true, recursive: true });
	mkdirSync(DEFINITIONS_DIR, { recursive: true });
	mkdirSync(BODIES_DIR, { recursive: true });
}

// IDs of the two albums whose PremiereDate is overridden to match today so
// the "on this day" discovery sweep always finds exactly two results.
const ON_THIS_DAY_IDS = new Set(['album-1', 'album-2']);

function todayMMDD(): string {
	const now = new Date();
	return `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function withTodayDate(album: JellyfinAlbumItem, mmdd: string): JellyfinAlbumItem {
	if (!ON_THIS_DAY_IDS.has(album.Id)) return album;
	const year = album.PremiereDate?.slice(0, 4) ?? '2000';
	return { ...album, PremiereDate: `${year}-${mmdd}` };
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

function generate(): void {
	reset();

	// ---- auth (QuickConnect happy path, all instant) ----
	fixture('auth-enabled', get('/QuickConnect/Enabled'), true);
	fixture('auth-initiate', post('/QuickConnect/Initiate'), {
		Code: 'ATOLLA-1234',
		Secret: 'atolla-mock-secret',
	});
	fixture('auth-connect', get('/QuickConnect/Connect'), {
		Authenticated: true,
		Code: 'ATOLLA-1234',
		Secret: 'atolla-mock-secret',
	});
	fixture('auth-authenticate', post('/Users/AuthenticateWithQuickConnect'), {
		AccessToken: 'atolla-mock-token',
		ServerId: 'atolla-mock-server',
		User: { Id: USER_ID, Name: 'atolla' },
	});
	fixture('system-info', get('/System/Info/Public'), {
		Id: 'atolla-mock-server',
		ProductName: 'Jellyfin Server',
		ServerName: 'atolla mock server',
		StartupWizardCompleted: true,
		Version: '12.0.0',
	});
	fixture('users-me', get('/Users/Me'), { Id: USER_ID, Name: 'atolla' });
	fixture(
		'probe-albums',
		get(`/Users/${USER_ID}/Items`, { IncludeItemTypes: 'MusicAlbum' }),
		envelope(albumsDefaultOrder(mockJellyfinAlbums).slice(0, 1)),
	);

	// ---- album collections (all share /Items, disambiguated by sortBy) ----
	const mmdd = todayMMDD();
	const albumsSorted = albumsDefaultOrder(mockJellyfinAlbums);
	// albums with today's month/day patched onto the two "on this day" albums
	const albumsWithTodayDate = albumsDefaultOrder(
		mockJellyfinAlbums.map((a) => withTodayDate(a, mmdd)),
	);
	fixture(
		'albums-list',
		get('/Items', { includeItemTypes: 'MusicAlbum', sortBy: 'PremiereDate,SortName' }),
		envelope(albumsSorted),
	);
	fixture(
		'albums-recent',
		get('/Items', { includeItemTypes: 'MusicAlbum', sortBy: 'DateCreated' }),
		envelope(albumsSorted.slice(0, 6)),
	);
	fixture(
		'albums-random',
		get('/Items', { includeItemTypes: 'MusicAlbum', sortBy: 'Random' }),
		envelope(albumsSorted),
	);
	fixture(
		'albums-releasedates',
		get('/Items', { includeItemTypes: 'MusicAlbum', sortBy: 'PremiereDate' }),
		envelope(albumsWithTodayDate),
	);

	// ---- getAlbumsByIds: on-this-day hydration (the only known caller) ----
	// IDs must appear in the order the discovery sweep collects them (PremiereDate desc).
	const onThisDayIdOrder = albumsWithTodayDate
		.filter((a) => ON_THIS_DAY_IDS.has(a.Id))
		.map((a) => a.Id);
	fixture(
		'albums-by-ids-on-this-day',
		get('/Items', { ids: onThisDayIdOrder.join(','), includeItemTypes: 'MusicAlbum' }),
		envelope(
			onThisDayIdOrder.flatMap((id) => {
				const album = albumsWithTodayDate.find((a) => a.Id === id);
				return album ? [album] : [];
			}),
		),
	);

	// ---- per-album item fetch (AlbumView calls getAlbumsByIds([id]) when genres are missing) ----
	for (const album of mockJellyfinAlbums) {
		fixture(
			`album-by-id-${slug(album.Id)}`,
			get('/Items', { ids: album.Id, includeItemTypes: 'MusicAlbum' }),
			envelope([album]),
		);
	}

	// ---- artists / playlists / genres lists ----
	fixture(
		'artists-list',
		get('/Items', { includeItemTypes: 'MusicArtist', sortBy: 'SortName' }),
		envelope(bySortName(mockJellyfinArtists)),
	);
	fixture(
		'playlists-list',
		get('/Items', { includeItemTypes: 'Playlist', sortBy: 'SortName' }),
		envelope(bySortName(mockJellyfinPlaylists)),
	);
	fixture('genres-list', get('/MusicGenres'), envelope(bySortName(mockJellyfinGenres)));

	// ---- albums by artist ----
	for (const artist of mockJellyfinArtists) {
		const albums = albumsDefaultOrder(
			mockJellyfinAlbums.filter((album) =>
				(album.ArtistItems ?? []).some((ref) => ref.Id === artist.Id),
			),
		);
		if (albums.length === 0) continue;
		fixture(
			`albums-by-artist-${slug(artist.Id)}`,
			get('/Items', { albumArtistIds: artist.Id, includeItemTypes: 'MusicAlbum' }),
			envelope(albums),
		);
	}

	// ---- tracks by album ----
	for (const album of mockJellyfinAlbums) {
		const tracks = mockJellyfinTracks.filter((track) => track.AlbumId === album.Id).map(trackDto);
		fixture(
			`tracks-by-album-${slug(album.Id)}`,
			get('/Items', { parentId: album.Id }),
			envelope(tracks),
		);
	}

	// ---- tracks by artist + artist top tracks (both key on artistIds, split by sortBy) ----
	const albumsById = new Map(mockJellyfinAlbums.map((album) => [album.Id, album]));
	for (const artist of mockJellyfinArtists) {
		const artistTracks = mockJellyfinTracks
			.filter((track) => (track.ArtistItems ?? []).some((ref) => ref.Id === artist.Id))
			.sort((a, b) => {
				const aRelease = (a.AlbumId ? albumsById.get(a.AlbumId)?.PremiereDate : undefined) ?? '';
				const bRelease = (b.AlbumId ? albumsById.get(b.AlbumId)?.PremiereDate : undefined) ?? '';
				return bRelease.localeCompare(aRelease);
			})
			.map(trackDto);
		if (artistTracks.length === 0) continue;
		fixture(
			`tracks-by-artist-${slug(artist.Id)}`,
			get('/Items', {
				artistIds: artist.Id,
				includeItemTypes: 'Audio',
				sortBy: 'PremiereDate,SortName',
			}),
			envelope(artistTracks),
		);
		fixture(
			`top-tracks-${slug(artist.Id)}`,
			get('/Items', {
				artistIds: artist.Id,
				includeItemTypes: 'Audio',
				sortBy: 'PlayCount,SortName',
			}),
			envelope(artistTracks.slice(0, 5)),
		);
	}

	// ---- tracks by genre (random + sortname variants; pinning sortBy beats shuffled-library) ----
	const tracksById = new Map(mockJellyfinTracks.map((track) => [track.Id, track]));
	for (const genre of mockJellyfinGenres) {
		const ids = mockGenreTrackIds[genre.Id] ?? [];
		const genreTracks = ids.flatMap((id) => {
			const track = tracksById.get(id);
			return track ? [trackDto(track)] : [];
		});
		const genreTracksSortName = [...genreTracks].sort((a, b) =>
			(a.Name ?? '').localeCompare(b.Name ?? ''),
		);
		fixture(
			`tracks-by-genre-${slug(genre.Id)}-sortname`,
			get('/Items', { genreIds: genre.Id, includeItemTypes: 'Audio', sortBy: 'SortName' }),
			envelope(genreTracksSortName),
		);
		fixture(
			`tracks-by-genre-${slug(genre.Id)}-random`,
			get('/Items', { genreIds: genre.Id, includeItemTypes: 'Audio', sortBy: 'Random' }),
			envelope(genreTracks),
		);
	}

	// ---- tracks by year ----
	const years = new Set<number>();
	for (const track of mockJellyfinTracks) {
		const year = yearOf(track);
		if (year) years.add(year);
	}
	for (const year of years) {
		const yearTracks = mockJellyfinTracks
			.filter((track) => yearOf(track) === year)
			.sort((a, b) => a.Id.localeCompare(b.Id))
			.map(trackDto);
		fixture(
			`tracks-by-year-${year}`,
			get('/Items', { includeItemTypes: 'Audio', sortBy: 'Random', years: String(year) }),
			envelope(yearTracks),
		);
	}

	// ---- shuffled whole library (2-param; year/genre fixtures are more specific and win) ----
	fixture(
		'shuffled-library',
		get('/Items', { includeItemTypes: 'Audio', sortBy: 'Random' }),
		envelope(mockJellyfinTracks.map(trackDto)),
	);

	// ---- /Years (random music years discovery) ----
	fixture(
		'years',
		get('/Years'),
		envelope(
			[...years]
				.sort((a, b) => b - a)
				.map((year) => ({ Name: String(year), ProductionYear: year, Type: 'Year' })),
		),
	);

	// ---- getItem: single-item lookups for detail screens ----
	for (const item of [
		...mockJellyfinArtists,
		...mockJellyfinGenres,
		...mockJellyfinPlaylists,
		...mockJellyfinAlbums,
	]) {
		fixture(`item-${slug(item.Id)}`, get(`/Items/${item.Id}`), item);
	}

	// ---- playlist tracks (running order from ItemIds) ----
	for (const playlist of mockJellyfinPlaylists) {
		const ids = playlist.ItemIds ?? [];
		const tracks = ids.flatMap((id) => {
			const track = tracksById.get(id);
			return track ? [{ ...trackDto(track), PlaylistItemId: id }] : [];
		});
		fixture(
			`playlist-items-${slug(playlist.Id)}`,
			get(`/Playlists/${playlist.Id}/Items`),
			envelope(tracks),
		);
	}

	// ---- A-Z letter filters (albums / artists / playlists, all 26 letters + digit bucket) ----
	// nameStartsWith and nameLessThan are more specific than the base list fixtures so
	// wiretap's most-specific-wins rule picks the right one for filtered requests.
	for (const letter of LETTERS) {
		const upper = letter.toUpperCase();
		fixture(
			`albums-letter-${letter}`,
			get('/Items', {
				includeItemTypes: 'MusicAlbum',
				nameStartsWith: upper,
				sortBy: 'PremiereDate,SortName',
			}),
			envelope(albumsDefaultOrder(mockJellyfinAlbums.filter((a) => startsWithLetter(a, letter)))),
		);
		fixture(
			`artists-letter-${letter}`,
			get('/Items', { includeItemTypes: 'MusicArtist', nameStartsWith: upper, sortBy: 'SortName' }),
			envelope(bySortName(mockJellyfinArtists.filter((a) => startsWithLetter(a, letter)))),
		);
		fixture(
			`playlists-letter-${letter}`,
			get('/Items', { includeItemTypes: 'Playlist', nameStartsWith: upper, sortBy: 'SortName' }),
			envelope(bySortName(mockJellyfinPlaylists.filter((p) => startsWithLetter(p, letter)))),
		);
	}
	// '0' bucket: nameLessThan='A' covers digits and symbols; the app narrows client-side
	fixture(
		'albums-letter-0',
		get('/Items', {
			includeItemTypes: 'MusicAlbum',
			nameLessThan: 'A',
			sortBy: 'PremiereDate,SortName',
		}),
		envelope(albumsDefaultOrder(mockJellyfinAlbums.filter(sortsBeforeA))),
	);
	fixture(
		'artists-letter-0',
		get('/Items', { includeItemTypes: 'MusicArtist', nameLessThan: 'A', sortBy: 'SortName' }),
		envelope(bySortName(mockJellyfinArtists.filter(sortsBeforeA))),
	);
	fixture(
		'playlists-letter-0',
		get('/Items', { includeItemTypes: 'Playlist', nameLessThan: 'A', sortBy: 'SortName' }),
		envelope(bySortName(mockJellyfinPlaylists.filter(sortsBeforeA))),
	);

	// NOT YET COVERED (tracked, not silently dropped):
	//   - search (searchTerm= is free text; handled dynamically by media-server.ts)
	//   - scrobble POST /UserPlayedItems/{id}
	console.log(`generated ${fixtureCount} fixtures into ${OUT}`);
}

generate();
