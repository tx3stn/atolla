import { describe, expect, it } from 'bun:test';
import {
	formatAudioQuality,
	mapJellyfinAlbumToAlbum,
	mapJellyfinArtistToArtist,
	mapJellyfinGenreToGenre,
	mapJellyfinLyricsToLyrics,
	mapJellyfinPlaylistToPlaylist,
	mapJellyfinTrackToTrack,
} from './JellyfinMappers';

describe('mapJellyfinAlbumToAlbum', () => {
	type AlbumItem = Parameters<typeof mapJellyfinAlbumToAlbum>[0];

	it('defaults a missing album name so it never renders a null label', () => {
		const album = mapJellyfinAlbumToAlbum({ Id: 'a1' } as AlbumItem);
		expect(album.name).toBe('Unknown Album');
		expect(album.artistName).toBe('');
	});

	it('keeps the provided name when present', () => {
		const album = mapJellyfinAlbumToAlbum({ Id: 'a1', Name: 'Discovery' } as AlbumItem);
		expect(album.name).toBe('Discovery');
	});

	it('reads the server sort name', () => {
		const album = mapJellyfinAlbumToAlbum({
			Id: 'a1',
			Name: 'The Downward Spiral',
			SortName: 'downward spiral',
		} as AlbumItem);
		expect(album.sortName).toBe('downward spiral');
	});

	it('leaves the sort name undefined when the server omits it', () => {
		const album = mapJellyfinAlbumToAlbum({ Id: 'a1', Name: 'Discovery' } as AlbumItem);
		expect(album.sortName).toBeUndefined();
	});
});

describe('mapJellyfinArtistToArtist', () => {
	type ArtistItem = Parameters<typeof mapJellyfinArtistToArtist>[0];

	it('reads the server sort name', () => {
		const artist = mapJellyfinArtistToArtist({
			Id: 'ar1',
			Name: 'MØL',
			SortName: 'møl',
		} as ArtistItem);
		expect(artist.sortName).toBe('møl');
	});

	it('leaves the sort name undefined when the server omits it', () => {
		const artist = mapJellyfinArtistToArtist({ Id: 'ar1', Name: 'MØL' } as ArtistItem);
		expect(artist.sortName).toBeUndefined();
	});
});

describe('mapJellyfinPlaylistToPlaylist', () => {
	type PlaylistItem = Parameters<typeof mapJellyfinPlaylistToPlaylist>[0];

	it('reads the server sort name', () => {
		const playlist = mapJellyfinPlaylistToPlaylist({
			Id: 'p1',
			Name: 'The Commute',
			SortName: 'commute',
		} as PlaylistItem);
		expect(playlist.sortName).toBe('commute');
	});
});

describe('mapJellyfinGenreToGenre', () => {
	type GenreItem = Parameters<typeof mapJellyfinGenreToGenre>[0];

	it('reads the server sort name', () => {
		const genre = mapJellyfinGenreToGenre({
			Id: 'g1',
			Name: 'Électronique',
			SortName: 'électronique',
		} as GenreItem);
		expect(genre.sortName).toBe('électronique');
	});
});

describe('mapJellyfinTrackToTrack', () => {
	type TrackItem = Parameters<typeof mapJellyfinTrackToTrack>[0];

	it('builds an album image url when AlbumId is present', () => {
		const calls: Array<string> = [];
		const track = mapJellyfinTrackToTrack({ AlbumId: 'album-1', Id: 't1' } as TrackItem, {
			albumPrimaryImageUrl: (albumId) => {
				calls.push(albumId);
				return `https://img/${albumId}`;
			},
		});

		expect(calls).toEqual(['album-1']);
		expect(track.albumId).toBe('album-1');
		expect(track.albumImageUrl).toBe('https://img/album-1');
	});

	it('maps ParentIndexNumber to the disc number', () => {
		const track = mapJellyfinTrackToTrack({ Id: 't1', ParentIndexNumber: 2 } as TrackItem);
		expect(track.discNumber).toBe(2);
	});

	it('leaves the disc number undefined when ParentIndexNumber is absent', () => {
		const track = mapJellyfinTrackToTrack({ Id: 't1' } as TrackItem);
		expect(track.discNumber).toBeUndefined();
	});

	it('does not build an album image url for an empty AlbumId', () => {
		const calls: Array<string> = [];
		const track = mapJellyfinTrackToTrack({ AlbumId: '', Id: 't1' } as TrackItem, {
			albumPrimaryImageUrl: (albumId) => {
				calls.push(albumId);
				return `https://img/${albumId}`;
			},
		});

		expect(calls).toEqual([]); // resolver not invoked for an empty id
		expect(track.albumId).toBeUndefined();
		expect(track.albumImageUrl).toBeUndefined();
	});

	it('carries HasLyrics through so the context menu can gate before fetching', () => {
		expect(mapJellyfinTrackToTrack({ HasLyrics: true, Id: 't1' } as TrackItem).hasLyrics).toBe(
			true,
		);
		expect(mapJellyfinTrackToTrack({ HasLyrics: false, Id: 't1' } as TrackItem).hasLyrics).toBe(
			false,
		);
	});

	it('leaves hasLyrics undefined when the server omits it, so callers treat it as unknown', () => {
		expect(mapJellyfinTrackToTrack({ Id: 't1' } as TrackItem).hasLyrics).toBeUndefined();
	});
});

describe('mapJellyfinLyricsToLyrics', () => {
	it('converts start ticks to seconds without flooring', () => {
		const lyrics = mapJellyfinLyricsToLyrics({
			Lyrics: [
				{ Start: 0, Text: 'first' },
				{ Start: 15_500_000, Text: 'second' },
			],
			Metadata: { IsSynced: true },
		});

		expect(lyrics?.synced).toBe(true);
		expect(lyrics?.lines).toEqual([
			{ startSeconds: 0, text: 'first' },
			{ startSeconds: 1.55, text: 'second' },
		]);
	});

	it('clamps a negative start time to zero', () => {
		const lyrics = mapJellyfinLyricsToLyrics({
			Lyrics: [{ Start: -10_000_000, Text: 'line' }],
			Metadata: { IsSynced: true },
		});

		expect(lyrics?.lines[0].startSeconds).toBe(0);
	});

	it('treats lyrics without timestamps as unsynced and drops the start times', () => {
		const lyrics = mapJellyfinLyricsToLyrics({
			Lyrics: [{ Text: 'first' }, { Text: 'second' }],
		});

		expect(lyrics?.synced).toBe(false);
		expect(lyrics?.lines).toEqual([{ text: 'first' }, { text: 'second' }]);
	});

	it('trusts an explicit IsSynced false even when the lines carry timestamps', () => {
		const lyrics = mapJellyfinLyricsToLyrics({
			Lyrics: [{ Start: 10_000_000, Text: 'line' }],
			Metadata: { IsSynced: false },
		});

		expect(lyrics?.synced).toBe(false);
		expect(lyrics?.lines).toEqual([{ text: 'line' }]);
	});

	it('infers synced when every line has a timestamp and the server omits IsSynced', () => {
		const lyrics = mapJellyfinLyricsToLyrics({
			Lyrics: [
				{ Start: 0, Text: 'first' },
				{ Start: 10_000_000, Text: 'second' },
			],
		});

		expect(lyrics?.synced).toBe(true);
	});

	it('falls back to unsynced when only some lines carry a timestamp', () => {
		const lyrics = mapJellyfinLyricsToLyrics({
			Lyrics: [{ Start: 0, Text: 'first' }, { Text: 'second' }],
		});

		expect(lyrics?.synced).toBe(false);
	});

	it('keeps blank lines between verses but drops leading and trailing padding', () => {
		const lyrics = mapJellyfinLyricsToLyrics({
			Lyrics: [{ Text: '  ' }, { Text: 'first' }, { Text: '' }, { Text: 'second' }, { Text: ' ' }],
		});

		expect(lyrics?.lines).toEqual([{ text: 'first' }, { text: '' }, { text: 'second' }]);
	});

	it('returns null when the payload has no usable lines', () => {
		expect(mapJellyfinLyricsToLyrics({})).toBeNull();
		expect(mapJellyfinLyricsToLyrics({ Lyrics: [] })).toBeNull();
		expect(mapJellyfinLyricsToLyrics({ Lyrics: [{ Text: '   ' }] })).toBeNull();
	});
});

describe('formatAudioQuality', () => {
	it('returns undefined for missing mediaSources', () => {
		expect(formatAudioQuality(undefined)).toBeUndefined();
		expect(formatAudioQuality([])).toBeUndefined();
	});

	it('returns undefined when no audio stream is present', () => {
		expect(
			formatAudioQuality([
				{
					Container: 'flac',
					MediaStreams: [{ Codec: 'srt', Type: 'Subtitle' }],
				},
			]),
		).toBeUndefined();
	});

	it('formats FLAC with integer kHz sample rate and bit depth', () => {
		expect(
			formatAudioQuality([
				{
					MediaStreams: [{ BitDepth: 24, Codec: 'flac', SampleRate: 96000, Type: 'Audio' }],
				},
			]),
		).toBe('flac 96/24');
	});

	it('formats FLAC with non-integer kHz sample rate', () => {
		expect(
			formatAudioQuality([
				{
					MediaStreams: [{ BitDepth: 16, Codec: 'flac', SampleRate: 44100, Type: 'Audio' }],
				},
			]),
		).toBe('flac 44/16');
	});

	it('formats FLAC with missing sample rate / bit depth as codec only', () => {
		expect(
			formatAudioQuality([
				{
					MediaStreams: [{ Codec: 'flac', Type: 'Audio' }],
				},
			]),
		).toBe('flac');
	});

	it('formats MP3 with bitrate from audio stream', () => {
		expect(
			formatAudioQuality([
				{
					MediaStreams: [{ BitRate: 320000, Codec: 'mp3', Type: 'Audio' }],
				},
			]),
		).toBe('mp3 320');
	});

	it('formats AAC with bitrate from audio stream', () => {
		expect(
			formatAudioQuality([
				{
					MediaStreams: [{ BitRate: 256000, Codec: 'aac', Type: 'Audio' }],
				},
			]),
		).toBe('aac 256');
	});

	it('falls back to source-level Bitrate when audio stream BitRate is absent', () => {
		expect(
			formatAudioQuality([
				{
					Bitrate: 320000,
					MediaStreams: [{ Codec: 'mp3', Type: 'Audio' }],
				},
			]),
		).toBe('mp3 320');
	});

	it('falls back to Container when audio stream Codec is absent', () => {
		expect(
			formatAudioQuality([
				{
					Container: 'flac',
					MediaStreams: [{ BitDepth: 24, SampleRate: 96000, Type: 'Audio' }],
				},
			]),
		).toBe('flac 96/24');
	});

	it('returns codec only for lossy format with no bitrate', () => {
		expect(
			formatAudioQuality([
				{
					MediaStreams: [{ Codec: 'mp3', Type: 'Audio' }],
				},
			]),
		).toBe('mp3');
	});
});
