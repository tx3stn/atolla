import { describe, expect, it } from 'bun:test';
import type { AuthSession } from 'atolla_core/src/models/Auth';
import type { IHTTPClient } from 'valdi_http/src/IHTTPClient';
import { type ConnectionMode, ConnectionModes } from '../models/App';
import type { Preferences } from '../stores/Preferences';
import { Connectivity, type ConnectivityDeps, type ConnectivityRenderState } from './Connectivity';
import type { SessionManager } from './SessionManager';

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
	cancelLogin: number;
	ensureLoaded: number;
	login: Array<string>;
	onOnline: number;
	onUserChanged: Array<string>;
}

function flush(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeConnectivity(over?: {
	ensureLoaded?: () => Promise<void>;
	hasStoredMode?: boolean;
	mode?: ConnectionMode;
	session?: AuthSession | null;
	setMode?: () => Promise<void>;
}): {
	calls: Calls;
	connectivity: Connectivity;
	state: Array<Partial<ConnectivityRenderState>>;
} {
	const state: Array<Partial<ConnectivityRenderState>> = [];
	const calls: Calls = {
		cancelLogin: 0,
		ensureLoaded: 0,
		login: [],
		onOnline: 0,
		onUserChanged: [],
	};

	const preferences = {
		hasStoredMode: over?.hasStoredMode ?? true,
		mode: over?.mode ?? ConnectionModes.offline,
		setMode: over?.setMode ?? (() => Promise.resolve()),
	} as unknown as Preferences;

	const sessionManager = {
		cancelLogin: () => {
			calls.cancelLogin += 1;
		},
		getEffectiveDeviceId: () => 'atolla-default',
		getHttpClient: () => ({}) as unknown as IHTTPClient,
		getSession: () => over?.session ?? null,
		login: (serverUrl: string) => {
			calls.login.push(serverUrl);
			return Promise.resolve(makeSession());
		},
		setMockMode: () => {},
	} as unknown as SessionManager;

	const deps: ConnectivityDeps = {
		applyState: (partial) => state.push(partial),
		downloadService: {
			ensureLoaded: () => {
				calls.ensureLoaded += 1;
				return over?.ensureLoaded?.() ?? Promise.resolve();
			},
		} as unknown as ConnectivityDeps['downloadService'],
		onOnline: () => {
			calls.onOnline += 1;
		},
		onUserChanged: (userId) => calls.onUserChanged.push(userId),
		playlistCreateService: {} as ConnectivityDeps['playlistCreateService'],
		playlistEditService: {} as ConnectivityDeps['playlistEditService'],
		preferences,
		resolveCachedImage: () => null,
		sessionManager,
		setNativeAuthToken: () => {},
	};

	return { calls, connectivity: new Connectivity(deps), state };
}

describe('Connectivity.bootstrap auth-required decision', () => {
	it('requires auth on a fresh install (offline default, mode never stored)', async () => {
		const { connectivity, state } = makeConnectivity({
			hasStoredMode: false,
			mode: ConnectionModes.offline,
		});

		await connectivity.bootstrap(null);

		expect(state[state.length - 1]?.isAuthRequired).toBe(true);
	});

	it('stays in the app when a returning user is offline with no session', async () => {
		const { connectivity, state } = makeConnectivity({
			hasStoredMode: true,
			mode: ConnectionModes.offline,
		});

		await connectivity.bootstrap(null);

		expect(state[state.length - 1]?.isAuthRequired).toBe(false);
	});

	it('requires auth after logout (online mode, no session)', async () => {
		const { connectivity, state } = makeConnectivity({
			hasStoredMode: true,
			mode: ConnectionModes.online,
		});

		await connectivity.bootstrap(null);

		expect(state[state.length - 1]?.isAuthRequired).toBe(true);
	});

	it('does not require auth when a valid session is restored', async () => {
		const { connectivity, state } = makeConnectivity({
			hasStoredMode: false,
			mode: ConnectionModes.online,
		});

		await connectivity.bootstrap(makeSession());

		expect(state[state.length - 1]?.isAuthRequired).toBe(false);
	});

	it('logging in from a fresh install lands in online mode, not offline', async () => {
		const { connectivity, state } = makeConnectivity({
			hasStoredMode: false,
			mode: ConnectionModes.offline,
		});
		// fresh install: bootstrap leaves render state in the offline default on the connect screen
		await connectivity.bootstrap(null);
		// connect() flips the internal mode to online synchronously (before its first await)
		connectivity.connect('https://server');
		state.length = 0;

		// SessionManager.login emits onSessionChanged, which App routes to handleSessionChanged
		connectivity.handleSessionChanged(makeSession());

		const last = state[state.length - 1];
		expect(last?.connectionMode).toBe(ConnectionModes.online);
		expect(last?.isAuthRequired).toBe(false);
	});

	it('a successful login flushes queued offline work by going online (after activating the user)', async () => {
		const { calls, connectivity } = makeConnectivity({
			hasStoredMode: false,
			mode: ConnectionModes.offline,
		});
		await connectivity.bootstrap(null);

		connectivity.connect('https://server');
		await flush();

		expect(calls.onOnline).toBe(1);
		// the user scope must be activated before the reconnect sync runs
		expect(calls.onUserChanged).toEqual(['shared', 'user-1']);
	});
});

// the offline transport reads the download index through synchronous getters, so it must not
// exist until that index is in memory — otherwise a library view mounting during the hydration
// window reads half-loaded data and keeps it (offline lists are a single page and never refetch)
describe('Connectivity offline transport hydration gate', () => {
	it('does not stand up the offline transport until the download index has loaded', async () => {
		let releaseLoad: () => void = () => {};
		const { connectivity } = makeConnectivity({
			ensureLoaded: () => new Promise<void>((resolve) => (releaseLoad = resolve)),
			mode: ConnectionModes.offline,
		});

		let bootstrapped = false;
		void connectivity.bootstrap(null).then(() => {
			bootstrapped = true;
		});
		await flush();

		expect(bootstrapped).toBe(false);
		expect(connectivity.getTransport()).toBeUndefined();

		releaseLoad();
		await flush();

		expect(bootstrapped).toBe(true);
		expect(connectivity.getTransport()).toBeDefined();
	});

	it('waits for the download index when switching into offline mode at runtime', async () => {
		let releaseLoad: () => void = () => {};
		const { connectivity } = makeConnectivity({
			ensureLoaded: () => new Promise<void>((resolve) => (releaseLoad = resolve)),
			mode: ConnectionModes.online,
			session: makeSession(),
		});
		await connectivity.bootstrap(makeSession());
		const liveTransport = connectivity.getTransport();

		let settled = false;
		void connectivity.setMode(ConnectionModes.offline).then(() => {
			settled = true;
		});
		await flush();

		expect(settled).toBe(false);
		expect(connectivity.getTransport()).toBe(liveTransport);

		releaseLoad();
		await flush();

		expect(settled).toBe(true);
		expect(connectivity.getTransport()).not.toBe(liveTransport);
	});

	// the live transport carries no downloaded data, so gating online boot on the index would
	// tax every online launch for nothing
	it('does not wait for the download index when booting online with a session', async () => {
		const { calls, connectivity } = makeConnectivity({
			mode: ConnectionModes.online,
		});

		await connectivity.bootstrap(makeSession());

		expect(calls.ensureLoaded).toBe(0);
		expect(connectivity.getTransport()).toBeDefined();
	});
});

describe('Connectivity.cancelConnect', () => {
	it('abandons the in-flight login', async () => {
		const { calls, connectivity } = makeConnectivity();
		await connectivity.bootstrap(null);

		connectivity.connect('https://server');
		connectivity.cancelConnect();

		expect(calls.cancelLogin).toBe(1);
	});

	// connect() awaits setMode before it ever reaches login(), so a cancel landing in that window
	// has no login to stop yet — without the attempt token it would be silently discarded and the
	// login would start anyway, moments after the user asked it not to
	it('stops a login that has not started yet when canceled during the setMode await', async () => {
		let releaseSetMode: () => void = () => {};
		const { calls, connectivity } = makeConnectivity({
			setMode: () => new Promise<void>((resolve) => (releaseSetMode = resolve)),
		});
		await connectivity.bootstrap(null);

		connectivity.connect('https://server');
		connectivity.cancelConnect();
		releaseSetMode();
		await flush();

		expect(calls.login).toEqual([]);
	});

	it('still connects on a fresh attempt after a cancel', async () => {
		const { calls, connectivity } = makeConnectivity();
		await connectivity.bootstrap(null);

		connectivity.connect('https://first');
		connectivity.cancelConnect();
		connectivity.connect('https://second');
		await flush();

		expect(calls.login).toEqual(['https://second']);
	});
});
