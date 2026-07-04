import 'jasmine/src/jasmine';
import { Connectivity, type ConnectivityDeps } from 'atolla/src/services/Connectivity';
import type { AuthSession } from 'atolla/src/services/JellyfinAuthService';
import type { SessionManager } from 'atolla/src/services/SessionManager';
import type { Preferences } from 'atolla/src/stores/Preferences';
import { LiveTransport } from 'atolla/src/transports/Live';
import { type ConnectionMode, ConnectionModes } from 'atolla/src/transports/Model';
import { OfflineTransport } from 'atolla/src/transports/Offline';

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
	setMockMode: Array<boolean>;
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
		setMockMode: [],
		setNativeAuthToken: [],
	};
	let session = opts?.session ?? null;

	const sessionManager = {
		clearSession: () => {
			session = null;
			return Promise.resolve();
		},
		getEffectiveDeviceId: () => 'dev-1',
		getSession: () => session,
		setMockMode: (isMock: boolean) => calls.setMockMode.push(isMock),
	} as unknown as SessionManager;

	const preferences = {
		mode: opts?.mode ?? ConnectionModes.offline,
		setMode: () => Promise.resolve(),
	} as unknown as Preferences;

	const deps: ConnectivityDeps = {
		applyState: (partial) => calls.applyState.push(partial),
		downloadService: {} as ConnectivityDeps['downloadService'],
		onOnline: () => {
			calls.onOnline += 1;
		},
		onUserChanged: (userId) => calls.onUserChanged.push(userId),
		playlistCreateService: {} as ConnectivityDeps['playlistCreateService'],
		playlistEditService: {} as ConnectivityDeps['playlistEditService'],
		preferences,
		sessionManager,
		setNativeAuthToken: (token) => calls.setNativeAuthToken.push(token),
		showToast: () => {},
	};

	return { calls, connectivity: new Connectivity(deps) };
}

function flush(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('Connectivity', () => {
	it('bootstraps online with a session into a live transport', () => {
		const session = makeSession();
		const { calls, connectivity } = makeConnectivity({ mode: ConnectionModes.online, session });

		connectivity.bootstrap(session);

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

	it('bootstraps offline with no session into an offline transport for the shared user', () => {
		const { calls, connectivity } = makeConnectivity({
			mode: ConnectionModes.offline,
			session: null,
		});

		connectivity.bootstrap(null);

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

	it('handleSessionChanged(null) while online marks auth-required and drops the transport', () => {
		const session = makeSession();
		const { calls, connectivity } = makeConnectivity({ mode: ConnectionModes.online, session });
		connectivity.bootstrap(session);

		connectivity.handleSessionChanged(null);

		expect(connectivity.getTransport() instanceof OfflineTransport).toBe(true);
		expect(calls.applyState.some((s) => s.isAuthRequired === true)).toBe(true);
		// online bootstrap pushed 'tok'; the session drop pushes '' so native stops using it
		expect(calls.setNativeAuthToken).toEqual(['tok', '']);
	});

	it('connect("mock") switches to the mock mode', async () => {
		const { connectivity } = makeConnectivity();

		connectivity.connect('mock');
		await flush();

		expect(connectivity.getMode()).toBe(ConnectionModes.mock);
	});
});
