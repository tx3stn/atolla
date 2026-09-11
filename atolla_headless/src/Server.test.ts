import { describe, expect, it } from 'bun:test';
import { InMemoryKeyValueStore } from 'atolla_core/src/stores/KeyValueStore';
import { PlaybackStore } from 'atolla_player/src/stores/Playback';
import type { HttpServer, RequestHandler } from './Http';
import type { RandomBytes } from './Random';
import { attachServer, ROUTE, type ServerDeps } from './Server';
import { makeStateVersion } from './StateVersion';

const PAIR_BODY = JSON.stringify({ controllerId: 'c1', controllerName: 'Phone' });

function counting(): RandomBytes {
	let next = 0;
	return (count) => Uint8Array.from({ length: count }, () => next++ & 0xff);
}

function deps(): ServerDeps {
	return {
		command: {
			playback: new PlaybackStore(),
			restored: Promise.resolve(),
			version: makeStateVersion(),
		},
		pair: { randomBytes: counting(), secrets: new InMemoryKeyValueStore() },
	};
}

function fakeHttpServer(answers: Array<{ body: string; requestId: number; status: number }>) {
	let handler: RequestHandler | undefined;

	const httpServer: HttpServer = {
		respond: (requestId, status, body) => {
			answers.push({ body, requestId, status });
			return true;
		},
		setControllersPath: () => {},
		setHandler: (given) => {
			handler = given;
		},
		setHelloBody: () => {},
		setLogLevel: () => {},
		setPairingCodePath: () => {},
		start: (_host, port) => port,
		stop: () => {},
	};

	return { dispatch: (...args: Parameters<RequestHandler>) => handler?.(...args), httpServer };
}

describe('attachServer', () => {
	it('answers the request it was dispatched, against its id', async () => {
		const answers: Array<{ body: string; requestId: number; status: number }> = [];
		const { dispatch, httpServer } = fakeHttpServer(answers);

		attachServer(httpServer, deps());
		dispatch(4242, ROUTE.state, '/state', '');
		await Promise.resolve();

		expect(answers).toEqual([{ body: '', requestId: 4242, status: 501 }]);
	});

	it('answers a request whose handler works asynchronously', async () => {
		const answers: Array<{ body: string; requestId: number; status: number }> = [];
		const { dispatch, httpServer } = fakeHttpServer(answers);

		attachServer(httpServer, deps());
		dispatch(7, ROUTE.pair, '/pair', PAIR_BODY);
		await settled();

		expect(answers).toHaveLength(1);
		expect(answers[0].requestId).toBe(7);
		expect(answers[0].status).toBe(200);
	});

	it('still answers when a handler rejects, so the connection is not left waiting', async () => {
		const answers: Array<{ body: string; requestId: number; status: number }> = [];
		const { dispatch, httpServer } = fakeHttpServer(answers);

		attachServer(httpServer, deps());
		dispatch(9, ROUTE.pair, '/pair', 'not json');
		await settled();

		expect(answers).toEqual([{ body: '', requestId: 9, status: 500 }]);
	});
});

function settled(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}
