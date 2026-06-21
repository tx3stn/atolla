import { describe, expect, it } from 'bun:test';
import type {
	DownloadedAlbumEntry,
	DownloadedArtistEntry,
	DownloadedGenreEntry,
	DownloadedPlaylistEntry,
	DownloadedTrackEntry,
} from './DownloadService';
import {
	buildOfflineDiagnosticsReport,
	type OfflineDiagnosticsDeps,
	type OfflineDownloadsSnapshot,
	serializeOfflineDiagnostics,
} from './OfflineDiagnostics';

function albumEntry(
	album: Partial<DownloadedAlbumEntry['album']>,
	trackIds: Array<string> = [],
): DownloadedAlbumEntry {
	return { album: album as DownloadedAlbumEntry['album'], artistLogoUrl: null, trackIds };
}

function trackEntry(
	track: Partial<DownloadedTrackEntry['track']>,
	complete: boolean,
): DownloadedTrackEntry {
	return {
		albumIds: [],
		complete,
		genreIds: [],
		playlistIds: [],
		requiredImageKeys: [],
		streamUrl: '',
		track: track as DownloadedTrackEntry['track'],
	};
}

function snapshot(overrides: Partial<OfflineDownloadsSnapshot> = {}): OfflineDownloadsSnapshot {
	return {
		getAllAlbums: () => [],
		getAllArtists: () => [],
		getAllGenres: () => [],
		getAllPlaylists: () => [],
		getAllTracks: () => [],
		getDownloadedTrackCount: () => 0,
		getDownloadingCount: () => 0,
		...overrides,
	};
}

function deps(overrides: Partial<OfflineDiagnosticsDeps> = {}): OfflineDiagnosticsDeps {
	return {
		connectionMode: 'offline',
		debugLoggingEnabled: false,
		downloads: snapshot(),
		generatedAt: '2026-05-29T00:00:00.000Z',
		platform: 'android',
		...overrides,
	};
}

describe('buildOfflineDiagnosticsReport', () => {
	it('counts albums and complete/incomplete tracks', () => {
		const report = buildOfflineDiagnosticsReport(
			deps({
				downloads: snapshot({
					getAllAlbums: () => [
						albumEntry({ artistId: 'ar1', artistName: 'A', id: 'al1', name: 'One' }),
					],
					getAllTracks: () => [
						trackEntry({ id: 't1', name: 'T1' }, true),
						trackEntry({ id: 't2', name: 'T2' }, false),
						trackEntry({ id: 't3', name: 'T3' }, true),
					],
					getDownloadedTrackCount: () => 2,
					getDownloadingCount: () => 1,
				}),
			}),
		);

		expect(report.counts.albums).toBe(1);
		expect(report.counts.tracks.total).toBe(3);
		expect(report.counts.tracks.complete).toBe(2);
		expect(report.counts.tracks.incomplete).toBe(1);
		expect(report.counts.downloadedTrackCount).toBe(2);
		expect(report.counts.downloadingCount).toBe(1);
	});

	it('detects duplicate ids within a collection', () => {
		const report = buildOfflineDiagnosticsReport(
			deps({
				downloads: snapshot({
					getAllAlbums: () => [
						albumEntry({ artistId: 'ar1', artistName: 'A', id: 'dup', name: 'One' }),
						albumEntry({ artistId: 'ar2', artistName: 'B', id: 'dup', name: 'Two' }),
						albumEntry({ artistId: 'ar3', artistName: 'C', id: 'unique', name: 'Three' }),
					],
				}),
			}),
		);

		expect(report.integrity.albums.duplicateIds).toContain('dup');
		expect(report.integrity.albums.duplicateIds).not.toContain('unique');
	});

	it('flags missing id / name fields', () => {
		const report = buildOfflineDiagnosticsReport(
			deps({
				downloads: snapshot({
					getAllAlbums: () => [
						albumEntry({ artistId: 'ar1', artistName: 'A', id: '', name: 'No Id' }),
						albumEntry({ artistId: 'ar2', artistName: 'B', id: 'al2' } as Partial<
							DownloadedAlbumEntry['album']
						>),
					],
				}),
			}),
		);

		expect(report.integrity.albums.missingId).toBe(1);
		expect(report.integrity.albums.missingName).toBe(1);
	});

	it('detects dangling track references on albums', () => {
		const report = buildOfflineDiagnosticsReport(
			deps({
				downloads: snapshot({
					getAllAlbums: () => [
						albumEntry({ artistId: 'ar1', artistName: 'A', id: 'al1', name: 'One' }, ['t1', 'tX']),
					],
					getAllTracks: () => [trackEntry({ id: 't1', name: 'T1' }, true)],
				}),
			}),
		);

		const dangling = report.integrity.danglingRefs.albumTrackIds;
		expect(dangling).toHaveLength(1);
		expect(dangling[0]?.id).toBe('al1');
		expect(dangling[0]?.missing).toEqual(['tX']);
	});

	it('never throws on malformed persisted blobs and records the parse failure', () => {
		let report!: ReturnType<typeof buildOfflineDiagnosticsReport>;
		expect(() => {
			report = buildOfflineDiagnosticsReport(
				deps({ rawPersisted: { recentlyPlayed: '{ not json' } }),
			);
		}).not.toThrow();
		expect(report.persisted.recentlyPlayed.present).toBe(true);
		expect(report.persisted.recentlyPlayed.parseOk).toBe(false);
	});

	it('summarizes the On This Day cache with today/tomorrow album counts', () => {
		const homeAlbums = JSON.stringify({
			today: { albums: [{ id: 'a' }, { id: 'b' }], date: '2026-05-29' },
			tomorrow: { albums: [{ id: 'c' }], date: '2026-05-30' },
			version: 1,
		});
		const report = buildOfflineDiagnosticsReport(deps({ rawPersisted: { homeAlbums } }));

		expect(report.persisted.homeAlbums.present).toBe(true);
		expect(report.persisted.homeAlbums.parseOk).toBe(true);
		expect(report.persisted.homeAlbums.count).toBe(3);
		expect(report.persisted.homeAlbums.note).toBe('onThisDay today=2 tomorrow=1');
	});
});

describe('serializeOfflineDiagnostics', () => {
	it('renders explicit markers for missing fields (undefined would otherwise vanish)', () => {
		const report = buildOfflineDiagnosticsReport(
			deps({
				downloads: snapshot({
					getAllAlbums: () => [
						albumEntry({ artistId: 'ar1', artistName: 'A', id: 'al1' } as Partial<
							DownloadedAlbumEntry['album']
						>),
					],
				}),
			}),
		);

		const json = serializeOfflineDiagnostics(report);
		expect(json).toContain('<undefined>');
	});

	it('redacts secrets from url fields', () => {
		const secret = 'super-secret-key-123';
		const report = buildOfflineDiagnosticsReport(
			deps({
				downloads: snapshot({
					getAllAlbums: () => [
						albumEntry({
							artistId: 'ar1',
							artistName: 'A',
							id: 'al1',
							imageUrl: `http://192.168.1.26:8096/Items/al1/Images/Primary?api_key=${secret}&tag=abc`,
							name: 'One',
						}),
					],
				}),
			}),
		);

		const json = serializeOfflineDiagnostics(report);
		expect(json).not.toContain(secret);
		expect(json).toContain('api_key=<redacted>');
		expect(json).toContain('tag=abc');
	});

	it('produces valid pretty JSON', () => {
		const json = serializeOfflineDiagnostics(buildOfflineDiagnosticsReport(deps()));
		expect(() => JSON.parse(json)).not.toThrow();
		expect(json).toContain('\n');
	});
});

// reference the unused entry types so imports stay meaningful as the report grows
const _unusedTypes: [DownloadedArtistEntry?, DownloadedPlaylistEntry?, DownloadedGenreEntry?] = [];
void _unusedTypes;
