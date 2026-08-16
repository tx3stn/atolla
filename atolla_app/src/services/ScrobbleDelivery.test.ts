import { describe, expect, it, spyOn } from 'bun:test';
import { LiveTransport } from 'atolla_jellyfin/src/transports/Live';
import {
	type NativeScrobbleQueue,
	type PendingScrobble,
	ScrobbleService,
} from 'atolla_player/src/services/ScrobbleService';
import type { IHTTPClient } from 'valdi_http/src/IHTTPClient';

const TEST_NOW = Date.UTC(2026, 0, 15, 0, 0, 0);

type FakeQueue = NativeScrobbleQueue & { entries: Array<PendingScrobble> };

function createQueue(initial: Array<PendingScrobble> = []): FakeQueue {
	const entries = [...initial];
	return {
		ack: (trackId: string, playedAtMs: number) => {
			const index = entries.findIndex((e) => e.trackId === trackId && e.playedAtMs === playedAtMs);
			if (index >= 0) {
				entries.splice(index, 1);
			}
		},
		entries,
		read: () => [...entries],
	};
}

// exercises the real ScrobbleService -> LiveTransport -> HTTP path (the delivery seam), rather than
// a stubbed deliverScrobble
describe('ScrobbleService with LiveTransport', () => {
	function createHTTPClient(
		statusCode: number,
		body?: Uint8Array,
	): { calls: Array<{ method: string; pathOrUrl: string }>; client: IHTTPClient } {
		const calls: Array<{ method: string; pathOrUrl: string }> = [];
		const respond = (method: string) => (pathOrUrl: string) => {
			calls.push({ method, pathOrUrl });
			return Promise.resolve({ body, headers: {}, statusCode });
		};
		const client = { delete: respond('delete'), get: respond('get'), post: respond('post') };
		return { calls, client: client as unknown as IHTTPClient };
	}

	function serviceWith(client: IHTTPClient, queue: FakeQueue): ScrobbleService {
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', client);
		return new ScrobbleService({
			deliverScrobble: (trackId, playedAtIso) =>
				transport.scrobbleTrackPlayed(trackId, playedAtIso),
			now: () => TEST_NOW,
			queue,
		});
	}

	it('delivers a native pending scrobble to the server and acks it on 200', async () => {
		const { calls, client } = createHTTPClient(200);
		const queue = createQueue([{ playedAtMs: TEST_NOW - 1000, trackId: 'track-1' }]);
		const service = serviceWith(client, queue);

		await service.syncFromNative();

		expect(calls).toHaveLength(1);
		expect(calls[0].method).toBe('post');
		expect(calls[0].pathOrUrl).toContain('/UserPlayedItems/track-1');
		expect(calls[0].pathOrUrl).toContain('datePlayed=');
		expect(queue.entries).toHaveLength(0);
	});

	it('keeps the scrobble queued and logs when the server returns 400', async () => {
		const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const { calls, client } = createHTTPClient(400, new TextEncoder().encode('{"Error":"bad"}'));
			const queue = createQueue([{ playedAtMs: TEST_NOW - 1000, trackId: 'track-1' }]);
			const service = serviceWith(client, queue);

			await service.syncFromNative();

			expect(calls).toHaveLength(1);
			expect(queue.entries).toHaveLength(1);
			expect(warnSpy).toHaveBeenCalled();
		} finally {
			warnSpy.mockRestore();
		}
	});
});
