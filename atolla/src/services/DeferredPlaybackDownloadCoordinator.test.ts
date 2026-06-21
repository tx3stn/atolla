import { describe, expect, it } from 'bun:test';
import { DeferredPlaybackDownloadCoordinator } from './DeferredPlaybackDownloadCoordinator';

async function waitFor(predicate: () => boolean, timeoutMs = 250): Promise<void> {
	const started = Date.now();
	while (!predicate()) {
		if (Date.now() - started > timeoutMs) {
			throw new Error('condition not met before timeout');
		}
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
}

describe('DeferredPlaybackDownloadCoordinator', () => {
	it('does not run a deferred download until the matching source starts playing', () => {
		const coordinator = new DeferredPlaybackDownloadCoordinator();
		let runs = 0;
		coordinator.defer('current', {
			requestId: 1,
			run: () => {
				runs += 1;
			},
			source: 'https://audio/a',
			trackId: 'a',
		});

		expect(runs).toBe(0);

		coordinator.onPlaybackStarted({
			currentRequestId: 1,
			currentTrackId: 'a',
			source: 'https://audio/a',
		});

		expect(runs).toBe(1);
	});

	it('runs the deferred download only once across repeated playback-started signals', () => {
		const coordinator = new DeferredPlaybackDownloadCoordinator();
		let runs = 0;
		coordinator.defer('current', {
			requestId: 1,
			run: () => {
				runs += 1;
			},
			source: 'https://audio/a',
			trackId: 'a',
		});

		const signal = {
			currentRequestId: 1,
			currentTrackId: 'a',
			source: 'https://audio/a',
		};
		coordinator.onPlaybackStarted(signal);
		coordinator.onPlaybackStarted(signal);

		expect(runs).toBe(1);
	});

	it('runs both purposes when the same source starts', () => {
		const coordinator = new DeferredPlaybackDownloadCoordinator();
		const fired: Array<string> = [];
		coordinator.defer('current', {
			requestId: 1,
			run: () => fired.push('current'),
			source: 'https://audio/a',
			trackId: 'a',
		});
		coordinator.defer('prefetch', {
			requestId: 1,
			run: () => fired.push('prefetch'),
			source: 'https://audio/a',
			trackId: 'a',
		});

		coordinator.onPlaybackStarted({
			currentRequestId: 1,
			currentTrackId: 'a',
			source: 'https://audio/a',
		});

		expect(fired.sort()).toEqual(['current', 'prefetch']);
	});

	it('drops a superseded record when the same purpose is re-deferred', () => {
		const coordinator = new DeferredPlaybackDownloadCoordinator();
		const fired: Array<string> = [];
		coordinator.defer('current', {
			requestId: 1,
			run: () => fired.push('a'),
			source: 'https://audio/a',
			trackId: 'a',
		});
		coordinator.defer('current', {
			requestId: 2,
			run: () => fired.push('b'),
			source: 'https://audio/b',
			trackId: 'b',
		});

		// stale track's start can never run the new record
		coordinator.onPlaybackStarted({
			currentRequestId: 1,
			currentTrackId: 'a',
			source: 'https://audio/a',
		});
		expect(fired).toEqual([]);

		// only the latest record runs, and only for its own source
		coordinator.onPlaybackStarted({
			currentRequestId: 2,
			currentTrackId: 'b',
			source: 'https://audio/b',
		});
		expect(fired).toEqual(['b']);
	});

	it('does not run when the source does not match', () => {
		const coordinator = new DeferredPlaybackDownloadCoordinator();
		let runs = 0;
		coordinator.defer('current', {
			requestId: 1,
			run: () => {
				runs += 1;
			},
			source: 'https://audio/a',
			trackId: 'a',
		});

		coordinator.onPlaybackStarted({
			currentRequestId: 1,
			currentTrackId: 'a',
			source: 'https://audio/other',
		});

		expect(runs).toBe(0);
	});

	it('does not run when the requestId does not match', () => {
		const coordinator = new DeferredPlaybackDownloadCoordinator();
		let runs = 0;
		coordinator.defer('current', {
			requestId: 1,
			run: () => {
				runs += 1;
			},
			source: 'https://audio/a',
			trackId: 'a',
		});

		coordinator.onPlaybackStarted({
			currentRequestId: 99,
			currentTrackId: 'a',
			source: 'https://audio/a',
		});

		expect(runs).toBe(0);
	});

	it('does not run when the trackId does not match', () => {
		const coordinator = new DeferredPlaybackDownloadCoordinator();
		let runs = 0;
		coordinator.defer('current', {
			requestId: 1,
			run: () => {
				runs += 1;
			},
			source: 'https://audio/a',
			trackId: 'a',
		});

		coordinator.onPlaybackStarted({
			currentRequestId: 1,
			currentTrackId: 'other',
			source: 'https://audio/a',
		});

		expect(runs).toBe(0);
	});

	it('leaves a record pending when a non-matching source starts, then runs on its own source', () => {
		const coordinator = new DeferredPlaybackDownloadCoordinator();
		let runs = 0;
		coordinator.defer('current', {
			requestId: 1,
			run: () => {
				runs += 1;
			},
			source: 'https://audio/a',
			trackId: 'a',
		});

		coordinator.onPlaybackStarted({
			currentRequestId: 1,
			currentTrackId: 'a',
			source: 'https://audio/stale',
		});
		expect(runs).toBe(0);

		coordinator.onPlaybackStarted({
			currentRequestId: 1,
			currentTrackId: 'a',
			source: 'https://audio/a',
		});
		expect(runs).toBe(1);
	});

	it('cancel() drops a pending record', () => {
		const coordinator = new DeferredPlaybackDownloadCoordinator();
		let runs = 0;
		coordinator.defer('current', {
			requestId: 1,
			run: () => {
				runs += 1;
			},
			source: 'https://audio/a',
			trackId: 'a',
		});

		coordinator.cancel('current');
		coordinator.onPlaybackStarted({
			currentRequestId: 1,
			currentTrackId: 'a',
			source: 'https://audio/a',
		});

		expect(runs).toBe(0);
	});

	it('reset() drops all pending records', () => {
		const coordinator = new DeferredPlaybackDownloadCoordinator();
		let runs = 0;
		const make = (id: string) => ({
			requestId: 1,
			run: () => {
				runs += 1;
			},
			source: `https://audio/${id}`,
			trackId: id,
		});
		coordinator.defer('current', make('a'));
		coordinator.defer('prefetch', make('a'));

		coordinator.reset();
		coordinator.onPlaybackStarted({
			currentRequestId: 1,
			currentTrackId: 'a',
			source: 'https://audio/a',
		});

		expect(runs).toBe(0);
	});

	it('ignores a playback-started signal with no source', () => {
		const coordinator = new DeferredPlaybackDownloadCoordinator();
		let runs = 0;
		coordinator.defer('current', {
			requestId: 1,
			run: () => {
				runs += 1;
			},
			source: 'https://audio/a',
			trackId: 'a',
		});

		coordinator.onPlaybackStarted({
			currentRequestId: 1,
			currentTrackId: 'a',
			source: null,
		});

		expect(runs).toBe(0);
	});

	it('runs a pending record via the safety timeout when playback never starts', async () => {
		const coordinator = new DeferredPlaybackDownloadCoordinator(20);
		let runs = 0;
		coordinator.defer('current', {
			requestId: 1,
			run: () => {
				runs += 1;
			},
			source: 'https://audio/a',
			trackId: 'a',
		});

		await waitFor(() => runs === 1);
		expect(runs).toBe(1);
	});

	it('does not double-run when the safety timeout and playback-started both occur', async () => {
		const coordinator = new DeferredPlaybackDownloadCoordinator(20);
		let runs = 0;
		coordinator.defer('current', {
			requestId: 1,
			run: () => {
				runs += 1;
			},
			source: 'https://audio/a',
			trackId: 'a',
		});

		coordinator.onPlaybackStarted({
			currentRequestId: 1,
			currentTrackId: 'a',
			source: 'https://audio/a',
		});
		await new Promise((resolve) => setTimeout(resolve, 40));

		expect(runs).toBe(1);
	});
});
