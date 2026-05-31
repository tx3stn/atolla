import 'jasmine/src/jasmine';
import { AuthErrors } from 'atolla/src/errors/AuthErrors';
import { JellyfinAuthService } from 'atolla/src/services/JellyfinAuthService';

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

function createHTTPClientFactory(responses: Array<MockHTTPResponse | Error>) {
	const calls: Array<{
		baseUrl: string;
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

	return {
		calls,
		factory: (baseUrl: string) => ({
			get: (pathOrUrl: string, headers?: Record<string, string>) => {
				calls.push({
					baseUrl,
					headers,
					method: 'GET',
					pathOrUrl,
				});
				return nextResponse();
			},
			post: (
				pathOrUrl: string,
				body?: ArrayBuffer | Uint8Array,
				headers?: Record<string, string>,
			) => {
				calls.push({
					baseUrl,
					body,
					headers,
					method: 'POST',
					pathOrUrl,
				});
				return nextResponse();
			},
		}),
	};
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
	it('starts quick connect through valdi_http client', async () => {
		const { calls, factory } = createHTTPClientFactory([
			jsonResponse(200, true),
			jsonResponse(200, { Code: 'ABCD', Secret: 'secret-1' }),
		]);
		const service = new JellyfinAuthService({ httpClientFactory: factory, store: createStore() });

		const result = await service.startQuickConnect('demo.jellyfin.local');

		expect(result).toEqual({ code: 'ABCD', secret: 'secret-1' });
		expect(calls[0]).toEqual(
			jasmine.objectContaining({
				baseUrl: 'https://demo.jellyfin.local',
				method: 'GET',
				pathOrUrl: '/QuickConnect/Enabled',
			}),
		);
		expect(calls[1]).toEqual(
			jasmine.objectContaining({
				baseUrl: 'https://demo.jellyfin.local',
				method: 'POST',
				pathOrUrl: '/QuickConnect/Initiate',
			}),
		);
	});

	it('uses configured client device id in auth headers', async () => {
		const { calls, factory } = createHTTPClientFactory([
			jsonResponse(200, true),
			jsonResponse(200, { Code: 'ABCD', Secret: 'secret-1' }),
		]);
		const service = new JellyfinAuthService({
			clientDeviceId: 'profile-2-device',
			httpClientFactory: factory,
			store: createStore(),
		});

		await service.startQuickConnect('demo.jellyfin.local');

		expect(calls[0].headers?.['X-Emby-Authorization']).toContain('DeviceId="profile-2-device"');
		expect(calls[1].headers?.['X-Emby-Authorization']).toContain('DeviceId="profile-2-device"');
	});

	it('throws quick-connect unavailable when server reports disabled', async () => {
		const { factory } = createHTTPClientFactory([jsonResponse(200, false)]);
		const service = new JellyfinAuthService({ httpClientFactory: factory, store: createStore() });

		let thrown: unknown;
		try {
			await service.startQuickConnect('https://demo.jellyfin.local');
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toBe(AuthErrors.QUICK_CONNECT_NOT_AVAILABLE);
	});

	it('polls for quick-connect approval until authenticated', async () => {
		const { factory } = createHTTPClientFactory([
			jsonResponse(200, { Authenticated: false }),
			jsonResponse(200, { Authenticated: true }),
		]);
		let nowMs = 0;
		const service = new JellyfinAuthService({
			httpClientFactory: factory,
			now: () => nowMs,
			sleep: (ms: number) => {
				nowMs += ms;
				return Promise.resolve();
			},
			store: createStore(),
		});

		await service.waitForQuickConnectApproval(
			'https://demo.jellyfin.local',
			'secret-1',
			30_000,
			1_000,
		);
	});

	it('authenticates with quick connect using valdi_http post body', async () => {
		const { calls, factory } = createHTTPClientFactory([
			jsonResponse(200, {
				AccessToken: 'token-1',
				ServerId: 'server-1',
				User: { Id: 'user-1' },
			}),
			jsonResponse(200, { ServerName: 'Demo Server' }),
		]);
		const service = new JellyfinAuthService({ httpClientFactory: factory, store: createStore() });

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
		let factoryCalls = 0;
		const sleepCalls: Array<number> = [];
		const service = new JellyfinAuthService({
			httpClientFactory: () => {
				factoryCalls += 1;
				throw new Error('network should not be used in mock mode');
			},
			isMockMode: true,
			mockApprovalDelayMs: 1_500,
			sleep: (ms: number) => {
				sleepCalls.push(ms);
				return Promise.resolve();
			},
			store: createStore(),
		});

		const quickConnect = await service.startQuickConnect('demo.jellyfin.local');
		expect(quickConnect).toEqual({
			code: 'ATOLLA-MOCK',
			secret: 'atolla-mock-secret',
		});

		await service.waitForQuickConnectApproval('demo.jellyfin.local', quickConnect.secret);
		expect(sleepCalls).toEqual([1_500]);

		const session = await service.authenticateWithQuickConnect(
			'demo.jellyfin.local',
			quickConnect.secret,
		);
		expect(session.serverId).toBe('mock-server-id');
		expect(await service.validateSession(session)).toBe(true);
		await service.probeInitialAlbums(session);
		expect(factoryCalls).toBe(0);
	});

	it('includes HTTP status detail in connection error message', async () => {
		const { factory } = createHTTPClientFactory([jsonResponse(200, true), jsonResponse(503, {})]);
		const service = new JellyfinAuthService({ httpClientFactory: factory, store: createStore() });

		let thrown: unknown;
		try {
			await service.startQuickConnect('https://demo.jellyfin.local');
		} catch (error) {
			thrown = error;
		}

		expect(service.errorMessage(thrown)).toBe('connection error: HTTP 503');
	});

	it('includes generic error message detail for unknown errors', () => {
		const service = new JellyfinAuthService({ store: createStore() });

		expect(service.errorMessage(new Error('socket hang up'))).toBe(
			'connection error: socket hang up',
		);
	});

	it('does not duplicate connection error detail when message is identical', () => {
		const service = new JellyfinAuthService({ store: createStore() });

		expect(service.errorMessage(new Error('connection error'))).toBe('connection error');
	});
});
