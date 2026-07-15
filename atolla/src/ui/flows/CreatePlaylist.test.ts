import { describe, expect, it } from 'bun:test';
import type { CancelablePromise } from 'valdi_core/src/CancelablePromise';
import type { Track } from '../../models/Track';
import { pagedFromArray, type TrackPage, type TrackSource } from '../../services/TrackSource';
import {
	addTracksToPlaylist,
	createPlaylistAndAddTracks,
	selectQueueTracksForPlaylist,
} from './CreatePlaylist';

// a TrackSource that yields the given pages in order
function pagedSource(pages: Array<Array<Track>>): TrackSource {
	return (page) => Promise.resolve({ hasMore: page < pages.length, items: pages[page - 1] ?? [] });
}

const tracks = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }];

describe('selectQueueTracksForPlaylist', () => {
	it('includes played, current and up next in queue order when both options are on', () => {
		const result = selectQueueTracksForPlaylist(tracks, 2, {
			includePlayed: true,
			includeUpNext: true,
		});
		expect(result.map((t) => t.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
	});

	it('drops already played tracks when includePlayed is off', () => {
		const result = selectQueueTracksForPlaylist(tracks, 2, {
			includePlayed: false,
			includeUpNext: true,
		});
		expect(result.map((t) => t.id)).toEqual(['c', 'd', 'e']);
	});

	it('drops up next tracks when includeUpNext is off', () => {
		const result = selectQueueTracksForPlaylist(tracks, 2, {
			includePlayed: true,
			includeUpNext: false,
		});
		expect(result.map((t) => t.id)).toEqual(['a', 'b', 'c']);
	});

	it('always includes the current track even when both options are off', () => {
		const result = selectQueueTracksForPlaylist(tracks, 2, {
			includePlayed: false,
			includeUpNext: false,
		});
		expect(result.map((t) => t.id)).toEqual(['c']);
	});

	it('handles the current track being first', () => {
		const result = selectQueueTracksForPlaylist(tracks, 0, {
			includePlayed: true,
			includeUpNext: true,
		});
		expect(result.map((t) => t.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
	});

	it('handles the current track being last', () => {
		const result = selectQueueTracksForPlaylist(tracks, 4, {
			includePlayed: true,
			includeUpNext: true,
		});
		expect(result.map((t) => t.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
	});

	it('returns an empty array for an empty queue', () => {
		const result = selectQueueTracksForPlaylist([], 0, {
			includePlayed: true,
			includeUpNext: true,
		});
		expect(result).toEqual([]);
	});

	it('returns an empty array when the current index is out of range', () => {
		const result = selectQueueTracksForPlaylist(tracks, 99, {
			includePlayed: false,
			includeUpNext: false,
		});
		expect(result).toEqual([]);
	});
});

describe('addTracksToPlaylist', () => {
	it('adds every track across pages in order, one bulk call per page', async () => {
		const calls: Array<Array<string>> = [];
		await addTracksToPlaylist(
			'pl-1',
			pagedSource([[{ id: 'a' }, { id: 'b' }] as Array<Track>, [{ id: 'c' }] as Array<Track>]),
			(_playlistId, trackIds) => {
				calls.push(trackIds);
				return Promise.resolve();
			},
		);
		expect(calls).toEqual([['a', 'b'], ['c']]);
	});

	it('stops between pages once cancelled', async () => {
		const calls: Array<Array<string>> = [];
		let cancelled = false;
		await addTracksToPlaylist(
			'pl-1',
			pagedSource([[{ id: 'a' }] as Array<Track>, [{ id: 'b' }] as Array<Track>]),
			(_playlistId, trackIds) => {
				calls.push(trackIds);
				cancelled = true;
				return Promise.resolve();
			},
			{ isCancelled: () => cancelled },
		);
		expect(calls).toEqual([['a']]);
	});

	it('cancels the in-flight page fetch when the returned promise is cancelled', async () => {
		const calls: Array<Array<string>> = [];
		let fetchCanceled = false;
		let pageCall = 0;
		// page 1 resolves; page 2 hangs in-flight with a cancel spy
		const source: TrackSource = () => {
			pageCall += 1;
			if (pageCall === 1) {
				return Promise.resolve({ hasMore: true, items: [{ id: 'a' }] as Array<Track> });
			}
			const pending = new Promise<TrackPage>(() => {}) as CancelablePromise<TrackPage>;
			pending.cancel = () => {
				fetchCanceled = true;
			};
			return pending;
		};

		const add = addTracksToPlaylist('pl-1', source, (_playlistId, trackIds) => {
			calls.push(trackIds);
			return Promise.resolve();
		});
		// macrotask: lets page 1 fetch+add drain, leaving the loop parked on page 2's fetch
		await new Promise((resolve) => setTimeout(resolve, 0));
		add.cancel?.();

		expect(fetchCanceled).toBe(true);
		expect(calls).toEqual([['a']]);
	});

	it('treats a cancel-aborted page fetch as a clean stop, not a rejection', async () => {
		const calls: Array<Array<string>> = [];
		let pageCall = 0;
		let rejectPage: (error: unknown) => void = () => {};
		const source: TrackSource = () => {
			pageCall += 1;
			if (pageCall === 1) {
				return Promise.resolve({ hasMore: true, items: [{ id: 'a' }] as Array<Track> });
			}
			// page 2 rejects when cancelled, mimicking an aborted wire
			const pending = new Promise<TrackPage>((_resolve, reject) => {
				rejectPage = reject;
			}) as CancelablePromise<TrackPage>;
			pending.cancel = () => rejectPage(new Error('aborted'));
			return pending;
		};

		const add = addTracksToPlaylist('pl-1', source, (_playlistId, trackIds) => {
			calls.push(trackIds);
			return Promise.resolve();
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		add.cancel?.();

		// must resolve, not throw — a cancel is not an error
		await add;
		expect(calls).toEqual([['a']]);
	});
});

describe('createPlaylistAndAddTracks', () => {
	it('creates the playlist then adds every track in order', async () => {
		const added: Array<string> = [];
		const playlist = await createPlaylistAndAddTracks(
			'My Playlist',
			async (name) => ({ id: 'pl-1', name }),
			(_playlistId, trackIds) => {
				added.push(...trackIds);
				return Promise.resolve();
			},
			pagedFromArray([{ id: 'a' }, { id: 'b' }, { id: 'c' }] as Array<Track>),
		);
		expect(playlist.id).toBe('pl-1');
		expect(added).toEqual(['a', 'b', 'c']);
	});
});
