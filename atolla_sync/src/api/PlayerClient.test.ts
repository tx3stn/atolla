import { describe, expect, it } from 'bun:test';
import type { PairRequest } from './generated';
import { PlayerClient, REQUEST_CANCELLED } from './PlayerClient';
import type { HttpHeaders, HttpResponse, HttpTransport, PendingRequest } from './Transport';

const BASE_URL = 'http://127.0.0.1:45889';

const PAIR_REQUEST: PairRequest = {
	code: '19524002',
	controllerId: 'phone-1',
	controllerName: 'pixel 8',
};

interface TransportCall {
	body?: string;
	headers?: HttpHeaders;
	method: 'GET' | 'POST';
	url: string;
}

function answered(statusCode: number, json: unknown, headers: HttpHeaders = {}): HttpResponse {
	return { body: new TextEncoder().encode(JSON.stringify(json)), headers, statusCode };
}

function createTransport(responses: Array<HttpResponse>) {
	const calls: Array<TransportCall> = [];

	function settle(): PendingRequest<HttpResponse> {
		const queued = responses.shift();
		if (queued === undefined) {
			throw new Error('no queued response');
		}

		return Promise.resolve(queued);
	}

	const transport: HttpTransport = {
		get: (url, headers) => {
			calls.push({ headers, method: 'GET', url });

			return settle();
		},
		post: (url, body, headers) => {
			calls.push({
				body: body === undefined ? undefined : new TextDecoder().decode(body),
				headers,
				method: 'POST',
				url,
			});

			return settle();
		},
	};

	return { calls, transport };
}

// a request that never answers, so cancel is the only thing that can settle it
function createSilentTransport() {
	const cancels: Array<string> = [];
	const request: PendingRequest<HttpResponse> = Object.assign(new Promise<HttpResponse>(() => {}), {
		cancel: () => {
			cancels.push('cancelled');
		},
	});
	const transport: HttpTransport = { get: () => request, post: () => request };

	return { cancels, transport };
}

describe('PlayerClient', () => {
	it('gets /hello from the base url', async () => {
		const { calls, transport } = createTransport([answered(200, {})]);

		await new PlayerClient(BASE_URL, transport).hello();

		expect(calls).toEqual([{ headers: undefined, method: 'GET', url: `${BASE_URL}/hello` }]);
	});

	it('posts the request body to /pair as json bytes with a content type', async () => {
		const { calls, transport } = createTransport([answered(200, {})]);

		await new PlayerClient(BASE_URL, transport).pair(PAIR_REQUEST);

		expect(calls).toEqual([
			{
				body: JSON.stringify(PAIR_REQUEST),
				headers: { 'Content-Type': 'application/json' },
				method: 'POST',
				url: `${BASE_URL}/pair`,
			},
		]);
	});

	it('trims a trailing slash from the base url', async () => {
		const { calls, transport } = createTransport([answered(200, {})]);

		await new PlayerClient(`${BASE_URL}/`, transport).hello();

		expect(calls[0]?.url).toBe(`${BASE_URL}/hello`);
	});

	it('sends the api version header when the client was given one', async () => {
		const { calls, transport } = createTransport([answered(200, {})]);

		await new PlayerClient(BASE_URL, transport, 1).pair(PAIR_REQUEST);

		expect(calls[0]?.headers?.['Atolla-API-Version']).toBe('1');
	});

	it('sends no api version header by default', async () => {
		const { calls, transport } = createTransport([answered(200, {})]);

		await new PlayerClient(BASE_URL, transport).pair(PAIR_REQUEST);

		expect(calls[0]?.headers?.['Atolla-API-Version']).toBeUndefined();
	});

	it('passes the status, headers and body through without classifying them', async () => {
		const cargo = { anything: ['at', 'all'] };
		const { transport } = createTransport([answered(418, cargo, { 'x-kept': 'yes' })]);

		const answer = await new PlayerClient(BASE_URL, transport).hello();

		expect(answer.status).toBe(418);
		expect(answer.headers).toEqual({ 'x-kept': 'yes' });
		expect(answer.json).toEqual(cargo);
	});

	it('rejects when the body is not json', async () => {
		const { transport } = createTransport([
			{ body: new TextEncoder().encode('<html>'), headers: {}, statusCode: 200 },
		]);

		const request = new PlayerClient(BASE_URL, transport).hello();

		await expect(request).rejects.toThrow();
	});
});

describe('PlayerClient cancellation', () => {
	it('forwards cancel to the in-flight request', () => {
		const { cancels, transport } = createSilentTransport();

		const request = new PlayerClient(BASE_URL, transport).hello();
		request.cancel?.();

		expect(cancels).toEqual(['cancelled']);
	});

	it('settles its own promise when cancelled rather than hanging', async () => {
		const { transport } = createSilentTransport();

		const request = new PlayerClient(BASE_URL, transport).hello();
		request.cancel?.();

		await expect(request).rejects.toThrow(REQUEST_CANCELLED);
	});

	it('returns a real promise so callers keep catch and finally', () => {
		const { transport } = createSilentTransport();

		const request = new PlayerClient(BASE_URL, transport).hello();
		request.cancel?.();

		expect(request).toBeInstanceOf(Promise);
	});
});
