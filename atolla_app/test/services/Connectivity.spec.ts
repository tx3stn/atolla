import 'jasmine/src/jasmine';
import { type ConnectionMode, ConnectionModes } from 'atolla_app/src/models/App';
import { Connectivity, type ConnectivityDeps } from 'atolla_app/src/services/Connectivity';
import type { SessionManager } from 'atolla_app/src/services/SessionManager';
import type { Preferences } from 'atolla_app/src/stores/Preferences';
import type { AuthSession } from 'atolla_core/src/models/Auth';
import { LiveTransport } from 'atolla_jellyfin/src/transports/Live';
import { OfflineTransport } from 'atolla_player/src/transports/Offline';
import type { IHTTPClient } from 'valdi_http/src/IHTTPClient';

function makeSession(): AuthSession {
	return {
		accessToken: 'tok',
		serverId: 'sid',
		serverName: 'Home',
		serverUrl: 'https://server',
		userId: 'user-1',
	} as AuthSession;
}

interface Calls {
	applyState: Array<{ connectionMode?: ConnectionMode; isAuthRequired?: boolean }>;
	onOnline: number;
	onSessionExpired: number;
	onUserChanged: Array<string>;
	setNativeAuthHeader: Array<string>;
}

function unauthorizedClient(): IHTTPClient {
	const reject = () => Promise.resolve({ body: undefined, headers: {}, statusCode: 401 });
	return { delete: reject, get: reject, post: reject } as unknown as IHTTPClient;
}

function makeConnectivity(opts?: {
	httpClient?: IHTTPClient;
	mode?: ConnectionMode;
	session?: AuthSession | null;
}): {
	calls: Calls;
	connectivity: Connectivity;
} {
	const calls: Calls = {
		applyState: [],
		onOnline: 0,
		onSessionExpired: 0,
		onUserChanged: [],
		setNativeAuthHeader: [],
	};
	let session = opts?.session ?? null;

	const sessionManager = {
		clearSession: () => {
			session = null;
			return Promise.resolve();
		},
		expireSession: () => {
			session = null;
			connectivity.handleSessionChanged(null);
			return Promise.resolve();
		},
		getAuthHeader: () => 'MediaBrowser Token="tok"',
		getEffectiveDeviceId: () => 'dev-1',
		getEffectiveDeviceName: () => 'Pixel 9 Pro',
		getHttpClient: () => opts?.httpClient ?? ({} as unknown as IHTTPClient),
		getSession: () => session,
	} as unknown as SessionManager;

	const preferences = {
		mode: opts?.mode ?? ConnectionModes.offline,
		setMode: () => Promise.resolve(),
	} as unknown as Preferences;

	const deps: ConnectivityDeps = {
		applyState: (partial) => calls.applyState.push(partial),
		downloadService: {
			ensureLoaded: () => Promise.resolve(),
		} as unknown as ConnectivityDeps['downloadService'],
		onOnline: () => {
			calls.onOnline += 1;
		},
		onSessionExpired: () => {
			calls.onSessionExpired += 1;
		},
		onUserChanged: (userId) => calls.onUserChanged.push(userId),
		playlistCreateService: {} as ConnectivityDeps['playlistCreateService'],
		playlistEditService: {} as ConnectivityDeps['playlistEditService'],
		preferences,
		resolveCachedImage: () => null,
		sessionManager,
		setNativeAuthHeader: (header) => calls.setNativeAuthHeader.push(header),
	};

	const connectivity = new Connectivity(deps);
	return { calls, connectivity };
}

describe('Connectivity', () => {
	it('bootstraps online with a session into a live transport', async () => {
		const session = makeSession();
		const { calls, connectivity } = makeConnectivity({ mode: ConnectionModes.online, session });

		await connectivity.bootstrap(session);

		expect(connectivity.getTransport() instanceof LiveTransport).toBe(true);
		expect(connectivity.getMode()).toBe(ConnectionModes.online);
		expect(calls.onUserChanged).toEqual(['user-1']);
		expect(calls.setNativeAuthHeader).toEqual(['MediaBrowser Token="tok"']);
		expect(
			calls.applyState.some(
				(s) => s.connectionMode === ConnectionModes.online && s.isAuthRequired === false,
			),
		).toBe(true);
	});

	it('bootstraps offline with no session into an offline transport for the shared user', async () => {
		const { calls, connectivity } = makeConnectivity({
			mode: ConnectionModes.offline,
			session: null,
		});

		await connectivity.bootstrap(null);

		expect(connectivity.getTransport() instanceof OfflineTransport).toBe(true);
		expect(calls.onUserChanged).toEqual(['shared']);
		expect(calls.setNativeAuthHeader).toEqual(['']);
	});

	it('setMode(online) with a session builds a live transport and triggers reconnect', async () => {
		const session = makeSession();
		const { calls, connectivity } = makeConnectivity({ session });

		const ok = await connectivity.setMode(ConnectionModes.online);

		expect(ok).toBe(true);
		expect(connectivity.getTransport() instanceof LiveTransport).toBe(true);
		expect(calls.onOnline).toBe(1);
	});

	it('setMode(offline) swaps to an offline transport without reconnecting', async () => {
		const session = makeSession();
		const { calls, connectivity } = makeConnectivity({ session });

		await connectivity.setMode(ConnectionModes.offline);

		expect(connectivity.getTransport() instanceof OfflineTransport).toBe(true);
		expect(connectivity.getMode()).toBe(ConnectionModes.offline);
		expect(calls.onOnline).toBe(0);
	});

	it('a 401 from the live transport drops the app to offline without requiring auth', async () => {
		const session = makeSession();
		const { calls, connectivity } = makeConnectivity({
			httpClient: unauthorizedClient(),
			mode: ConnectionModes.online,
			session,
		});
		await connectivity.bootstrap(session);
		calls.applyState.length = 0;

		await new Promise<void>((resolve) =>
			connectivity
				.getTransport()
				.getAlbums(1, 50)
				.then(
					() => resolve(),
					() => resolve(),
				),
		);
		await new Promise<void>((resolve) => setTimeout(resolve, 0));

		expect(calls.onSessionExpired).toBe(1);
		expect(connectivity.getMode()).toBe(ConnectionModes.offline);
		expect(connectivity.getTransport() instanceof OfflineTransport).toBe(true);
		expect(calls.applyState.some((s) => s.isAuthRequired === true)).toBe(false);
		expect(calls.setNativeAuthHeader[calls.setNativeAuthHeader.length - 1]).toBe('');
	});

	it('handleSessionChanged(null) while online marks auth-required and drops the transport', async () => {
		const session = makeSession();
		const { calls, connectivity } = makeConnectivity({ mode: ConnectionModes.online, session });
		await connectivity.bootstrap(session);

		connectivity.handleSessionChanged(null);

		expect(connectivity.getTransport() instanceof OfflineTransport).toBe(true);
		expect(calls.applyState.some((s) => s.isAuthRequired === true)).toBe(true);
		expect(calls.setNativeAuthHeader).toEqual(['MediaBrowser Token="tok"', '']);
	});
});
