import { describe, expect, it } from 'bun:test';
import type { Track } from '../models/Track';
import type { PlaybackStore } from '../stores/Playback';
import { RecentlyPlayedStore } from '../stores/RecentlyPlayed';
import { PlaybackOrchestrator } from './PlaybackOrchestrator';
import type { ScrobbleService } from './ScrobbleService';

function makeTrack(id: string): Track {
	return { duration: 100, id, name: `Track ${id}` } as Track;
}

function createOrchestrator(
	playbackStore: { track: Track | null },
	requestRerender: () => void = () => {},
): PlaybackOrchestrator {
	return new PlaybackOrchestrator({
		playbackStore: playbackStore as unknown as PlaybackStore,
		requestRerender,
	});
}

function fakeScrobbleService(
	observed: Array<{ trackId: string | null; isPlaying: boolean; progressSeconds: number }> = [],
): ScrobbleService {
	return {
		observePlayback: (snapshot: {
			trackId: string | null;
			isPlaying: boolean;
			progressSeconds: number;
		}) => observed.push(snapshot),
		onAppReady: () => Promise.resolve(),
	} as unknown as ScrobbleService;
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

describe('PlaybackOrchestrator recently played', () => {
	it('records the active track as most recent', () => {
		const store = { track: makeTrack('a') as Track | null };
		const orchestrator = createOrchestrator(store);
		orchestrator.captureRecentlyPlayedTrack();
		expect(orchestrator.getRecentlyPlayedTracks().map((t) => t.id)).toEqual(['a']);
	});

	it('moves a repeated track to the front without duplicating', () => {
		const store = { track: makeTrack('a') as Track | null };
		const orchestrator = createOrchestrator(store);
		orchestrator.captureRecentlyPlayedTrack();
		store.track = makeTrack('b');
		orchestrator.captureRecentlyPlayedTrack();
		store.track = makeTrack('a');
		orchestrator.captureRecentlyPlayedTrack();
		expect(orchestrator.getRecentlyPlayedTracks().map((t) => t.id)).toEqual(['a', 'b']);
	});

	it('ignores repeated capture of the same active track', () => {
		const store = { track: makeTrack('a') as Track | null };
		const orchestrator = createOrchestrator(store);
		orchestrator.captureRecentlyPlayedTrack();
		orchestrator.captureRecentlyPlayedTrack();
		expect(orchestrator.getRecentlyPlayedTracks().map((t) => t.id)).toEqual(['a']);
	});

	it('caps history at five entries, keeping the most recent', () => {
		const store = { track: makeTrack('a') as Track | null };
		const orchestrator = createOrchestrator(store);
		for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) {
			store.track = makeTrack(id);
			orchestrator.captureRecentlyPlayedTrack();
		}
		expect(orchestrator.getRecentlyPlayedTracks().map((t) => t.id)).toEqual([
			'f',
			'e',
			'd',
			'c',
			'b',
		]);
	});

	it('forgets the last-observed track when playback stops', () => {
		const store = { track: makeTrack('a') as Track | null };
		const orchestrator = createOrchestrator(store);
		orchestrator.captureRecentlyPlayedTrack();
		store.track = null;
		orchestrator.captureRecentlyPlayedTrack();
		store.track = makeTrack('a');
		orchestrator.captureRecentlyPlayedTrack();
		expect(orchestrator.getRecentlyPlayedTracks().map((t) => t.id)).toEqual(['a']);
	});

	it('clears history on demand', () => {
		const store = { track: makeTrack('a') as Track | null };
		const orchestrator = createOrchestrator(store);
		orchestrator.captureRecentlyPlayedTrack();
		orchestrator.clearRecentlyPlayed();
		expect(orchestrator.getRecentlyPlayedTracks()).toEqual([]);
	});

	it('re-records the still-active track after clearing history', () => {
		const store = { track: makeTrack('a') as Track | null };
		const orchestrator = createOrchestrator(store);
		orchestrator.captureRecentlyPlayedTrack();
		orchestrator.clearRecentlyPlayed();
		orchestrator.captureRecentlyPlayedTrack();
		expect(orchestrator.getRecentlyPlayedTracks().map((t) => t.id)).toEqual(['a']);
	});

	it('ignores a superseded restore when user services are rebound mid-load', async () => {
		const deferred = createDeferred<string>();
		const slowStore = new RecentlyPlayedStore({
			fetchString: () => deferred.promise,
			storeString: () => Promise.resolve(),
		});
		const fastStore = new RecentlyPlayedStore();
		await fastStore.save([makeTrack('b')]);
		const orchestrator = createOrchestrator({ track: null });

		orchestrator.setUserServices({ recentlyPlayed: slowStore, scrobble: fakeScrobbleService() });
		orchestrator.setUserServices({ recentlyPlayed: fastStore, scrobble: fakeScrobbleService() });
		await flush();
		// the first (now-superseded) store resolves late with stale data; it must not win
		deferred.resolve(JSON.stringify([makeTrack('a')]));
		await flush();

		expect(orchestrator.getRecentlyPlayedTracks().map((t) => t.id)).toEqual(['b']);
	});

	it('restores the persisted list when user services are bound', async () => {
		const recentlyPlayed = new RecentlyPlayedStore();
		await recentlyPlayed.save([makeTrack('x'), makeTrack('y')]);
		let rerendered = false;
		const orchestrator = createOrchestrator({ track: null }, () => {
			rerendered = true;
		});

		orchestrator.setUserServices({ recentlyPlayed, scrobble: fakeScrobbleService() });
		await flush();

		expect(orchestrator.getRecentlyPlayedTracks().map((t) => t.id)).toEqual(['x', 'y']);
		expect(rerendered).toBe(true);
	});

	it('persists captures after the restore completes', async () => {
		const recentlyPlayed = new RecentlyPlayedStore();
		const playbackStore = { track: makeTrack('a') as Track | null };
		const orchestrator = createOrchestrator(playbackStore);

		orchestrator.setUserServices({ recentlyPlayed, scrobble: fakeScrobbleService() });
		await flush();
		playbackStore.track = makeTrack('b');
		orchestrator.captureRecentlyPlayedTrack();
		await flush();

		expect((await recentlyPlayed.load()).map((t) => t.id)).toEqual(['b', 'a']);
	});
});

describe('PlaybackOrchestrator scrobble snapshots', () => {
	it('forwards playback snapshots to the scrobble service', () => {
		const observed: Array<{ trackId: string | null; isPlaying: boolean; progressSeconds: number }> =
			[];
		const playbackStore = {
			isPlaying: true,
			progressSeconds: 12,
			seekTarget: null,
			track: makeTrack('a') as Track | null,
		};
		const orchestrator = createOrchestrator(playbackStore);

		orchestrator.setUserServices({
			recentlyPlayed: new RecentlyPlayedStore(),
			scrobble: fakeScrobbleService(observed),
		});
		orchestrator.syncScrobblePlaybackSnapshot();

		expect(observed[observed.length - 1]).toMatchObject({
			isPlaying: true,
			progressSeconds: 12,
			trackId: 'a',
		});
	});
});
