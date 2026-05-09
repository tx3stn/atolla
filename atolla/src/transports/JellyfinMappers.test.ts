import { describe, expect, it } from 'bun:test';
import { formatAudioQuality } from './JellyfinMappers';

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
