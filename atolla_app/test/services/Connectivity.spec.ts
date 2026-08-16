import 'jasmine/src/jasmine';
import { type ConnectionMode, ConnectionModes } from 'atolla_app/src/models/App';
import { Connectivity, type ConnectivityDeps } from 'atolla_app/src/services/Connectivity';
import type { SessionManager } from 'atolla_app/src/services/SessionManager';
import type { Preferences } from 'atolla_app/src/stores/Preferences';
import { OfflineTransport } from 'atolla_app/src/transports/Offline';
import type { AuthSession } from 'atolla_core/src/models/Auth';
import { LiveTransport } from 'atolla_jellyfin/src/transports/Live';
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
	onUserChanged: Array<string>;
	setNativeAuthToken: Array<string>;
}

function makeConnectivity(opts?: { mode?: ConnectionMode; session?: AuthSession | null }): {
	calls: Calls;
	connectivity: Connectivity;
} {
	const calls: Calls = {
		applyState: [],
		onOnline: 0,
		onUserChanged: [],
		setNativeAuthToken: [],
	};
	let session = opts?.session ?? null;

	const sessionManager = {
		clearSession: () => {
			session = null;
			return Promise.resolve();
		},
		getEffectiveDeviceId: () => 'dev-1',
		getHttpClient: () => ({}) as unknown as IHTTPClient,
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
		onUserChanged: (userId) => calls.onUserChanged.push(userId),
		playlistCreateService: {} as ConnectivityDeps['playlistCreateService'],
		playlistEditService: {} as ConnectivityDeps['playlistEditService'],
		preferences,
		sessionManager,
		setNativeAuthToken: (token) => calls.setNativeAuthToken.push(token),
	};

	return { calls, connectivity: new Connectivity(deps) };
}

describe('Connectivity', () => {
	it('bootstraps online with a session into a live transport', async () => {
		const session = makeSession();
		const { calls, connectivity } = makeConnectivity({ mode: ConnectionModes.online, session });

		await connectivity.bootstrap(session);

		expect(connectivity.getTransport() instanceof LiveTransport).toBe(true);
		expect(connectivity.getMode()).toBe(ConnectionModes.online);
		expect(calls.onUserChanged).toEqual(['user-1']);
		expect(calls.setNativeAuthToken).toEqual(['tok']);
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
		expect(calls.setNativeAuthToken).toEqual(['']);
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

	it('handleSessionChanged(null) while online marks auth-required and drops the transport', async () => {
		const session = makeSession();
		const { calls, connectivity } = makeConnectivity({ mode: ConnectionModes.online, session });
		await connectivity.bootstrap(session);

		connectivity.handleSessionChanged(null);

		expect(connectivity.getTransport() instanceof OfflineTransport).toBe(true);
		expect(calls.applyState.some((s) => s.isAuthRequired === true)).toBe(true);
		// online bootstrap pushed 'tok'; the session drop pushes '' so native stops using it
		expect(calls.setNativeAuthToken).toEqual(['tok', '']);
	});
});
