import { describe, expect, it } from 'bun:test';
import type { Hello } from 'atolla_sync/src/api/generated';
import { PlayerClient } from 'atolla_sync/src/api/PlayerClient';
import type { CancelablePromise } from 'valdi_core/src/CancelablePromise';
import type { IHTTPClient } from 'valdi_http/src/IHTTPClient';
import { PlayerErrors } from './PlayerErrors';
import { PlayerTransport } from './PlayerTransport';

interface Call {
	body?: Uint8Array;
	headers?: Record<string, string>;
	method: 'get' | 'post' | 'put';
	url: string;
}

function answeringClient(response: unknown = { headers: {}, statusCode: 204 }) {
	const calls: Array<Call> = [];
	const client = {
		get: (url: string, headers?: Record<string, string>) => {
			calls.push({ headers, method: 'get', url });
			return Promise.resolve(response);
		},
		post: (url: string, body?: Uint8Array, headers?: Record<string, string>) => {
			calls.push({ body, headers, method: 'post', url });
			return Promise.resolve(response);
		},
		put: (url: string, body?: Uint8Array, headers?: Record<string, string>) => {
			calls.push({ body, headers, method: 'put', url });
			return Promise.resolve(response);
		},
	};

	return { calls, client: client as unknown as IHTTPClient };
}

// a client whose requests never answer, so only the deadline can settle them
function silentClient() {
	const cancels = { count: 0 };
	let rejectRequest: (error: unknown) => void = () => {};
	const request = new Promise<never>((_resolve, reject) => {
		rejectRequest = reject;
	}) as CancelablePromise<never>;
	// valdi's HTTPClient rejects with this on cancel, so the double has to as well
	request.cancel = () => {
		cancels.count += 1;
		rejectRequest(new Error('Request was cancelled'));
	};
	const client = { get: () => request, post: () => request, put: () => request };

	return { cancels, client: client as unknown as IHTTPClient };
}

function manualTimer() {
	const state = { cleared: 0, fire: () => {}, scheduled: 0, scheduledMs: 0 };
	const timer = (callback: () => void, ms: number) => {
		state.scheduled += 1;
		state.scheduledMs = ms;
		state.fire = callback;

		return () => {
			state.cleared += 1;
		};
	};

	return { state, timer };
}

describe('PlayerTransport', () => {
	it('forwards a get with its headers', async () => {
		const { calls, client } = answeringClient();

		await new PlayerTransport(client).get('http://192.168.1.42:45889/hello', { Accept: 'x' });

		expect(calls).toEqual([
			{ headers: { Accept: 'x' }, method: 'get', url: 'http://192.168.1.42:45889/hello' },
		]);
	});

	it('forwards a post with its body and headers', async () => {
		const { calls, client } = answeringClient();
		const body = new TextEncoder().encode('{}');

		await new PlayerTransport(client).post('http://host:1/pair', body, { 'Content-Type': 'json' });

		expect(calls).toEqual([
			{
				body,
				headers: { 'Content-Type': 'json' },
				method: 'post',
				url: 'http://host:1/pair',
			},
		]);
	});

	it('forwards a put with its body and headers', async () => {
		const { calls, client } = answeringClient();
		const body = new TextEncoder().encode('{}');

		await new PlayerTransport(client).put('http://host:1/media-server', body, { A: 'b' });

		expect(calls).toEqual([
			{ body, headers: { A: 'b' }, method: 'put', url: 'http://host:1/media-server' },
		]);
	});

	it('answers with the response untouched', async () => {
		const response = {
			body: new TextEncoder().encode('hi'),
			headers: { 'content-type': 'application/json' },
			statusCode: 200,
		};
		const { client } = answeringClient(response);

		expect(await new PlayerTransport(client).get('http://host:1/hello')).toBe(response);
	});

	it('passes a rejection through as it arrives', async () => {
		const failure = new Error('network down');
		const client = { get: () => Promise.reject(failure) } as unknown as IHTTPClient;

		await expect(new PlayerTransport(client).get('http://host:1/hello')).rejects.toBe(failure);
	});

	it('gives up on a request that never answers', async () => {
		const { client } = silentClient();
		const { state, timer } = manualTimer();

		const request = new PlayerTransport(client, { timeoutMs: 15_000, timer }).get(
			'http://host:1/hello',
		);
		state.fire();

		await expect(request).rejects.toBe(PlayerErrors.PLAYER_TIMED_OUT);
	});

	it('cancels the underlying request when it gives up', () => {
		const { cancels, client } = silentClient();
		const { state, timer } = manualTimer();

		const request = new PlayerTransport(client, { timer }).get('http://host:1/hello');
		request.then(
			() => {},
			() => {},
		);
		state.fire();

		expect(cancels.count).toBe(1);
	});

	it('schedules the deadline it was given', () => {
		const { client } = silentClient();
		const { state, timer } = manualTimer();

		void new PlayerTransport(client, { timeoutMs: 25_000, timer }).get('http://host:1/state');

		expect(state.scheduledMs).toBe(25_000);
	});

	it('waits fifteen seconds when no deadline is chosen', () => {
		const { client } = silentClient();
		const { state, timer } = manualTimer();

		void new PlayerTransport(client, { timer }).get('http://host:1/hello');

		expect(state.scheduledMs).toBe(15_000);
	});

	it('clears the deadline once the request answers', async () => {
		const { client } = answeringClient();
		const { state, timer } = manualTimer();

		await new PlayerTransport(client, { timer }).get('http://host:1/hello');

		expect(state.cleared).toBe(1);
	});

	it('ignores a deadline that fires after the request answered', async () => {
		const { client } = answeringClient();
		const { state, timer } = manualTimer();

		const answer = await new PlayerTransport(client, { timer }).get('http://host:1/hello');
		state.fire();

		expect(answer.statusCode).toBe(204);
	});

	it('carries a PlayerClient call end to end', async () => {
		const hello: Hello = {
			apiVersions: [1],
			id: '0123456789abcdef',
			name: 'Kitchen',
			tier: 'tight',
			v: 1,
			version: '0.0.0',
		};
		const { calls, client } = answeringClient({
			body: new TextEncoder().encode(JSON.stringify(hello)),
			headers: {},
			statusCode: 200,
		});

		const answer = await new PlayerClient(
			'http://192.168.1.42:45889',
			new PlayerTransport(client),
		).hello();

		expect(calls[0]?.url).toBe('http://192.168.1.42:45889/hello');
		expect(answer.json).toEqual(hello);
		expect(answer.status).toBe(200);
	});

	it('cancels the underlying request when the caller cancels', () => {
		const { cancels, client } = silentClient();
		const { timer } = manualTimer();

		const request = new PlayerTransport(client, { timer }).get('http://host:1/hello');
		request.then(
			() => {},
			() => {},
		);
		request.cancel?.();

		expect(cancels.count).toBe(1);
	});
});
