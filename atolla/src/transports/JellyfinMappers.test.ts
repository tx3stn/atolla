import { describe, expect, it } from 'bun:test';
import {
	formatAudioQuality,
	mapJellyfinAlbumToAlbum,
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
