import 'jasmine/src/jasmine';
import { type AuthError, AuthErrors } from 'atolla/src/services/AuthErrors';
import { JellyfinAuthService } from 'atolla/src/services/JellyfinAuthService';
import type { IHTTPClient } from 'valdi_http/src/IHTTPClient';

interface MockHTTPResponse {
	body?: Uint8Array;
	headers: Record<string, string>;
	statusCode: number;
}

function jsonResponse(statusCode: number, body?: unknown): MockHTTPResponse {
	return {
		body: body === undefined ? undefined : new TextEncoder().encode(JSON.stringify(body)),
		headers: {},
		statusCode,
	};
}

function createHTTPClient(responses: Array<MockHTTPResponse | Error>) {
	const calls: Array<{
		body?: ArrayBuffer | Uint8Array;
		headers?: Record<string, string>;
		method: 'GET' | 'POST';
		pathOrUrl: string;
	}> = [];

	const nextResponse = (): Promise<MockHTTPResponse> => {
		const next = responses.shift();
		if (!next) {
			throw new Error('no queued response');
		}
		if (next instanceof Error) {
			throw next;
		}
		return Promise.resolve(next);
	};

	const client = {
		get: (pathOrUrl: string, headers?: Record<string, string>) => {
			calls.push({ headers, method: 'GET', pathOrUrl });
			return nextResponse();
		},
		post: (
			pathOrUrl: string,
			body?: ArrayBuffer | Uint8Array,
			headers?: Record<string, string>,
		) => {
			calls.push({ body, headers, method: 'POST', pathOrUrl });
			return nextResponse();
		},
	};

	return { calls, client: client as unknown as IHTTPClient };
}

function createStore() {
	return {
		clearSession: () => Promise.resolve(),
		loadRememberedServerUrl: () => Promise.resolve(''),
		loadSession: () => Promise.resolve(null),
		rememberServerUrl: () => Promise.resolve(),
		saveSession: () => Promise.resolve(),
	};
}

describe('JellyfinAuthService', () => {
	it('starts quick connect through the injected valdi_http client', async () => {
		const { calls, client } = createHTTPClient([
			jsonResponse(200, true),
			jsonResponse(200, { Code: 'ABCD', Secret: 'secret-1' }),
		]);
		const service = new JellyfinAuthService({ client, store: createStore() });

		const result = await service.startQuickConnect();

		expect(result).toEqual({ code: 'ABCD', secret: 'secret-1' });
		expect(calls[0]).toEqual(
			jasmine.objectContaining({
				method: 'GET',
				pathOrUrl: '/QuickConnect/Enabled',
			}),
		);
		expect(calls[1]).toEqual(
			jasmine.objectContaining({
				method: 'POST',
				pathOrUrl: '/QuickConnect/Initiate',
			}),
		);
	});

	it('uses configured client device id in auth headers', async () => {
		const { calls, client } = createHTTPClient([
			jsonResponse(200, true),
			jsonResponse(200, { Code: 'ABCD', Secret: 'secret-1' }),
		]);
		const service = new JellyfinAuthService({
			client,
			clientDeviceId: 'profile-2-device',
			store: createStore(),
		});

		await service.startQuickConnect();

		expect(calls[0].headers?.['X-Emby-Authorization']).toContain('DeviceId="profile-2-device"');
		expect(calls[1].headers?.['X-Emby-Authorization']).toContain('DeviceId="profile-2-device"');
	});

	it('throws quick-connect unavailable when server reports disabled', async () => {
		const { client } = createHTTPClient([jsonResponse(200, false)]);
		const service = new JellyfinAuthService({ client, store: createStore() });

		let thrown: unknown;
		try {
			await service.startQuickConnect();
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toBe(AuthErrors.QUICK_CONNECT_NOT_AVAILABLE);
	});

	it('polls for quick-connect approval until authenticated', async () => {
		const { client } = createHTTPClient([
			jsonResponse(200, { Authenticated: false }),
			jsonResponse(200, { Authenticated: true }),
		]);
		let nowMs = 0;
		const service = new JellyfinAuthService({
			client,
			now: () => nowMs,
			sleep: (ms: number) => {
				nowMs += ms;
				return Promise.resolve();
			},
			store: createStore(),
		});

		await service.waitForQuickConnectApproval('secret-1', 30_000, 1_000);
	});

	it('authenticates with quick connect using valdi_http post body', async () => {
		const { calls, client } = createHTTPClient([
			jsonResponse(200, {
				AccessToken: 'token-1',
				ServerId: 'server-1',
				User: { Id: 'user-1' },
			}),
			jsonResponse(200, { ServerName: 'Demo Server' }),
		]);
		const service = new JellyfinAuthService({ client, store: createStore() });

		const session = await service.authenticateWithQuickConnect(
			'https://demo.jellyfin.local',
			's3cr3t',
		);

		expect(session).toEqual({
			accessToken: 'token-1',
			serverId: 'server-1',
			serverName: 'Demo Server',
			serverUrl: 'https://demo.jellyfin.local',
			userId: 'user-1',
		});
		expect(calls[0].method).toBe('POST');
		expect(calls[0].pathOrUrl).toBe('/Users/AuthenticateWithQuickConnect');
		expect(new TextDecoder().decode(calls[0].body as Uint8Array)).toContain('"Secret":"s3cr3t"');
	});

	it('returns mock responses in mock mode without network access', async () => {
		let clientCalls = 0;
		const throwingClient = {
			get: () => {
				clientCalls += 1;
				throw new Error('network should not be used in mock mode');
			},
			post: () => {
				clientCalls += 1;
				throw new Error('network should not be used in mock mode');
			},
		} as unknown as IHTTPClient;
		const sleepCalls: Array<number> = [];
		const service = new JellyfinAuthService({
			client: throwingClient,
			isMockMode: true,
			mockApprovalDelayMs: 1_500,
			sleep: (ms: number) => {
				sleepCalls.push(ms);
				return Promise.resolve();
			},
			store: createStore(),
		});

		const quickConnect = await service.startQuickConnect();
		expect(quickConnect).toEqual({
			code: 'ATOLLA-MOCK',
			secret: 'atolla-mock-secret',
		});

		await service.waitForQuickConnectApproval(quickConnect.secret);
		expect(sleepCalls).toEqual([1_500]);

		const session = await service.authenticateWithQuickConnect(
			'demo.jellyfin.local',
			quickConnect.secret,
		);
		expect(session.serverId).toBe('mock-server-id');
		expect(await service.validateSession(session)).toBe(true);
		await service.probeInitialAlbums(session);
		expect(clientCalls).toBe(0);
	});

	it('includes HTTP status detail in connection error message', async () => {
		const { client } = createHTTPClient([jsonResponse(200, true), jsonResponse(503, {})]);
		const service = new JellyfinAuthService({ client, store: createStore() });

		let thrown: unknown;
		try {
			await service.startQuickConnect();
		} catch (error) {
			thrown = error;
		}

		expect((thrown as AuthError).msg()).toBe('connection error: HTTP 503');
	});
});
