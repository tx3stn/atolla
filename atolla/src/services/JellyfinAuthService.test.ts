import { describe, expect, it } from 'bun:test';
import type { IHTTPClient } from 'valdi_http/src/IHTTPClient';
import { AuthErrors } from './AuthErrors';
import { type AuthSession, JellyfinAuthService, normalizeServerUrl } from './JellyfinAuthService';

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
		if (!next) throw new Error('no queued response');
		if (next instanceof Error) return Promise.reject(next);
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

// a client whose every request behaves the same way, for polling / failure tests that
// don't queue a fixed sequence of responses
function stubClient(impl: {
	get?: () => Promise<MockHTTPResponse>;
	post?: () => Promise<MockHTTPResponse>;
}): IHTTPClient {
	return {
		get: impl.get ?? (() => Promise.reject(new Error('unexpected get'))),
		post: impl.post ?? (() => Promise.reject(new Error('unexpected post'))),
	} as unknown as IHTTPClient;
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

function makeService(options: Partial<ConstructorParameters<typeof JellyfinAuthService>[0]> = {}) {
	return new JellyfinAuthService({
		client: createHTTPClient([]).client,
		store: createStore(),
		...options,
	});
}

const validSession = {
	accessToken: 'token-1',
	serverId: 'server-1',
	serverName: 'Demo Server',
	serverUrl: 'https://demo.jellyfin.local',
	userId: 'user-1',
};

describe('normalizeServerUrl', () => {
	it('adds https:// when no scheme is present', () => {
		expect(normalizeServerUrl('demo.jellyfin.local')).toBe('https://demo.jellyfin.local');
	});

	it('preserves explicit http://', () => {
		expect(normalizeServerUrl('http://demo.jellyfin.local')).toBe('http://demo.jellyfin.local');
	});

	it('strips trailing slashes', () => {
		expect(normalizeServerUrl('https://demo.jellyfin.local///')).toBe(
			'https://demo.jellyfin.local',
		);
	});
});

describe('client device ID', () => {
	it('defaults to "atolla" when no clientDeviceId is provided', async () => {
		const { calls, client } = createHTTPClient([
			jsonResponse(200, true),
			jsonResponse(200, { Code: 'X', Secret: 'Y' }),
		]);
		await makeService({ client }).startQuickConnect();
		expect(calls[0].headers?.['X-Emby-Authorization']).toContain('DeviceId="atolla"');
	});

	it('defaults to "atolla" for empty string', async () => {
		const { calls, client } = createHTTPClient([
			jsonResponse(200, true),
			jsonResponse(200, { Code: 'X', Secret: 'Y' }),
		]);
		await makeService({ client, clientDeviceId: '' }).startQuickConnect();
		expect(calls[0].headers?.['X-Emby-Authorization']).toContain('DeviceId="atolla"');
	});

	it('sanitizes special characters to underscores', async () => {
		const { calls, client } = createHTTPClient([
			jsonResponse(200, true),
			jsonResponse(200, { Code: 'X', Secret: 'Y' }),
		]);
		await makeService({ client, clientDeviceId: 'my device!' }).startQuickConnect();
		expect(calls[0].headers?.['X-Emby-Authorization']).toContain('DeviceId="my_device_"');
	});

	it('setClientDeviceId updates the ID used in subsequent requests', async () => {
		const { calls, client } = createHTTPClient([
			jsonResponse(200, true),
			jsonResponse(200, { Code: 'X', Secret: 'Y' }),
		]);
		const service = makeService({ client });
		service.setClientDeviceId('updated-device');
		await service.startQuickConnect();
		expect(calls[0].headers?.['X-Emby-Authorization']).toContain('DeviceId="updated-device"');
	});
});

describe('loadSession', () => {
	const serviceWithStored = (stored: AuthSession | null) =>
		new JellyfinAuthService({
			client: createHTTPClient([]).client,
			store: { ...createStore(), loadSession: () => Promise.resolve(stored) },
		});

	it('returns the session when all identity fields are non-empty strings', async () => {
		expect(await serviceWithStored(validSession).loadSession()).toEqual(validSession);
	});

	it('returns null when the persisted session is null', async () => {
		expect(await serviceWithStored(null).loadSession()).toBeNull();
	});

	it('returns null for a partial/legacy session missing the access token', async () => {
		const partial = {
			serverId: 's',
			serverUrl: 'https://x',
			userId: 'u',
		} as unknown as AuthSession;
		expect(await serviceWithStored(partial).loadSession()).toBeNull();
	});

	it('returns null when an identity field is an empty string', async () => {
		expect(await serviceWithStored({ ...validSession, accessToken: '' }).loadSession()).toBeNull();
	});
});

describe('saveSession', () => {
	it('throws CONNECTION_ERROR when required fields are missing', async () => {
		const service = makeService();
		// biome-ignore lint/suspicious/noExplicitAny: intentional bad input for test
		await expect(service.saveSession({} as any)).rejects.toBe(AuthErrors.CONNECTION_ERROR);
	});

	it('delegates to store for a valid session', async () => {
		let saved: unknown = null;
		const store = {
			...createStore(),
			saveSession: (s: unknown) => {
				saved = s;
				return Promise.resolve();
			},
		};
		await new JellyfinAuthService({ client: createHTTPClient([]).client, store }).saveSession(
			validSession,
		);
		expect(saved).toEqual(validSession);
	});
});

describe('startQuickConnect', () => {
	it('throws QUICK_CONNECT_NOT_AVAILABLE when initiate returns 401', async () => {
		const { client } = createHTTPClient([jsonResponse(200, true), jsonResponse(401, {})]);
		await expect(makeService({ client }).startQuickConnect()).rejects.toBe(
			AuthErrors.QUICK_CONNECT_NOT_AVAILABLE,
		);
	});

	it('throws CONNECTION_ERROR when the enabled check cannot reach the server', async () => {
		const { client } = createHTTPClient([new Error('server unreachable')]);
		await expect(makeService({ client }).startQuickConnect()).rejects.toHaveProperty(
			'err',
			AuthErrors.CONNECTION_ERROR.err,
		);
	});

	it('throws CONNECTION_ERROR on network failure during initiate', async () => {
		const { client } = createHTTPClient([jsonResponse(200, true), new Error('ECONNREFUSED')]);
		await expect(makeService({ client }).startQuickConnect()).rejects.toHaveProperty(
			'err',
			AuthErrors.CONNECTION_ERROR.err,
		);
	});

	it('throws CONNECTION_ERROR when response is missing Code', async () => {
		const { client } = createHTTPClient([
			jsonResponse(200, true),
			jsonResponse(200, { Secret: 'secret-only' }),
		]);
		await expect(makeService({ client }).startQuickConnect()).rejects.toHaveProperty(
			'err',
			AuthErrors.CONNECTION_ERROR.err,
		);
	});

	it('throws CONNECTION_ERROR when response body is empty', async () => {
		const { client } = createHTTPClient([jsonResponse(200, true), jsonResponse(200)]);
		await expect(makeService({ client }).startQuickConnect()).rejects.toHaveProperty(
			'err',
			AuthErrors.CONNECTION_ERROR.err,
		);
	});
});

describe('waitForQuickConnectApproval', () => {
	it('mock: throws QUICK_CONNECT_TIMED_OUT when timeoutMs is less than mock delay', async () => {
		const sleepCalls: Array<number> = [];
		const service = makeService({
			isMockMode: true,
			mockApprovalDelayMs: 5_000,
			sleep: (ms: number) => {
				sleepCalls.push(ms);
				return Promise.resolve();
			},
		});
		await expect(service.waitForQuickConnectApproval('secret', 3_000)).rejects.toBe(
			AuthErrors.QUICK_CONNECT_TIMED_OUT,
		);
		expect(sleepCalls).toEqual([3_000]);
	});

	it('real: throws QUICK_CONNECT_TIMED_OUT after all polls fail to authenticate', async () => {
		const client = stubClient({
			get: () => Promise.resolve(jsonResponse(200, { Authenticated: false })),
		});
		let nowMs = 0;
		const service = makeService({
			client,
			now: () => nowMs,
			sleep: (ms: number) => {
				nowMs += ms;
				return Promise.resolve();
			},
		});
		await expect(service.waitForQuickConnectApproval('secret', 2_000, 1_000)).rejects.toBe(
			AuthErrors.QUICK_CONNECT_TIMED_OUT,
		);
	});

	it('real: throws CONNECTION_ERROR on network failure during poll', async () => {
		const client = stubClient({ get: () => Promise.reject(new Error('network down')) });
		const service = makeService({
			client,
			now: () => 0,
			sleep: () => Promise.resolve(),
		});
		await expect(
			service.waitForQuickConnectApproval('secret', 10_000, 1_000),
		).rejects.toHaveProperty('err', AuthErrors.CONNECTION_ERROR.err);
	});
});

describe('authenticateWithQuickConnect', () => {
	it('throws CONNECTION_ERROR on non-success HTTP status', async () => {
		const { client } = createHTTPClient([jsonResponse(401, {})]);
		await expect(
			makeService({ client }).authenticateWithQuickConnect('https://demo.jellyfin.local', 'secret'),
		).rejects.toHaveProperty('err', AuthErrors.CONNECTION_ERROR.err);
	});

	it('throws CONNECTION_ERROR when AccessToken is missing from response', async () => {
		const { client } = createHTTPClient([
			jsonResponse(200, { ServerId: 's1', User: { Id: 'u1' } }),
		]);
		await expect(
			makeService({ client }).authenticateWithQuickConnect('https://demo.jellyfin.local', 'secret'),
		).rejects.toHaveProperty('err', AuthErrors.CONNECTION_ERROR.err);
	});

	it('throws CONNECTION_ERROR when User.Id is missing from response', async () => {
		const { client } = createHTTPClient([
			jsonResponse(200, { AccessToken: 'tok', ServerId: 's1', User: {} }),
		]);
		await expect(
			makeService({ client }).authenticateWithQuickConnect('https://demo.jellyfin.local', 'secret'),
		).rejects.toHaveProperty('err', AuthErrors.CONNECTION_ERROR.err);
	});

	it('returns a session including the server name from /System/Info/Public', async () => {
		const { calls, client } = createHTTPClient([
			jsonResponse(200, { AccessToken: 'tok', ServerId: 's1', User: { Id: 'u1' } }),
			jsonResponse(200, { ServerName: 'Living Room Server' }),
		]);
		const session = await makeService({ client }).authenticateWithQuickConnect(
			'https://demo.jellyfin.local',
			'secret',
		);
		expect(session).toEqual({
			accessToken: 'tok',
			serverId: 's1',
			serverName: 'Living Room Server',
			serverUrl: 'https://demo.jellyfin.local',
			userId: 'u1',
		});
		expect(calls[1].pathOrUrl).toBe('/System/Info/Public');
	});

	it('still authenticates with an empty server name when the info fetch fails', async () => {
		const { client } = createHTTPClient([
			jsonResponse(200, { AccessToken: 'tok', ServerId: 's1', User: { Id: 'u1' } }),
			new Error('network down'),
		]);
		const session = await makeService({ client }).authenticateWithQuickConnect(
			'https://demo.jellyfin.local',
			'secret',
		);
		expect(session.serverName).toBe('');
		expect(session.accessToken).toBe('tok');
	});
});

describe('fetchServerDetails', () => {
	it('returns the server name from /System/Info/Public', async () => {
		const { calls, client } = createHTTPClient([
			jsonResponse(200, { ServerName: 'My Jellyfin', Version: '10.9.0' }),
		]);
		const details = await makeService({ client }).fetchServerDetails();
		expect(details.ServerName).toBe('My Jellyfin');
		expect(calls[0].pathOrUrl).toBe('/System/Info/Public');
	});

	it('returns an empty result on a non-success status', async () => {
		const { client } = createHTTPClient([jsonResponse(500, {})]);
		const details = await makeService({ client }).fetchServerDetails();
		expect(details.ServerName).toBeUndefined();
	});

	it('returns an empty result on a network error', async () => {
		const { client } = createHTTPClient([new Error('network error')]);
		const details = await makeService({ client }).fetchServerDetails();
		expect(details.ServerName).toBeUndefined();
	});

	it('returns an empty result for a malformed body', async () => {
		const { client } = createHTTPClient([jsonResponse(200)]);
		const details = await makeService({ client }).fetchServerDetails();
		expect(details.ServerName).toBeUndefined();
	});

	it('mock mode returns the mock server name without a request', async () => {
		const { calls, client } = createHTTPClient([]);
		const details = await makeService({ client, isMockMode: true }).fetchServerDetails();
		expect(details.ServerName).toBe('atolla mock server');
		expect(calls.length).toBe(0);
	});
});

describe('validateSession', () => {
	it('returns false for null input', async () => {
		// biome-ignore lint/suspicious/noExplicitAny: intentional bad input for test
		expect(await makeService().validateSession(null as any)).toBe(false);
	});

	it('returns false when serverUrl is not a string', async () => {
		expect(
			await makeService().validateSession({
				...validSession,
				// biome-ignore lint/suspicious/noExplicitAny: intentional bad input for test
				serverUrl: undefined as any,
			}),
		).toBe(false);
	});

	it('mock: returns false when access token is empty', async () => {
		expect(
			await makeService({ isMockMode: true }).validateSession({
				...validSession,
				accessToken: '',
			}),
		).toBe(false);
	});

	it('returns false on network error', async () => {
		const client = stubClient({ get: () => Promise.reject(new Error('network error')) });
		expect(await makeService({ client }).validateSession(validSession)).toBe(false);
	});

	it('returns false on non-success HTTP status', async () => {
		const { client } = createHTTPClient([jsonResponse(401, {})]);
		expect(await makeService({ client }).validateSession(validSession)).toBe(false);
	});
});

describe('probeInitialAlbums', () => {
	it('throws FAILED_TO_FETCH_DATA for an invalid session', async () => {
		// biome-ignore lint/suspicious/noExplicitAny: intentional bad input for test
		await expect(makeService().probeInitialAlbums({} as any)).rejects.toBe(
			AuthErrors.FAILED_TO_FETCH_DATA,
		);
	});

	it('throws FAILED_TO_FETCH_DATA on non-success HTTP status', async () => {
		const { client } = createHTTPClient([jsonResponse(403, {})]);
		await expect(makeService({ client }).probeInitialAlbums(validSession)).rejects.toBe(
			AuthErrors.FAILED_TO_FETCH_DATA,
		);
	});

	it('throws FAILED_TO_FETCH_DATA on network error', async () => {
		const client = stubClient({ get: () => Promise.reject(new Error('network error')) });
		await expect(makeService({ client }).probeInitialAlbums(validSession)).rejects.toBe(
			AuthErrors.FAILED_TO_FETCH_DATA,
		);
	});
});
