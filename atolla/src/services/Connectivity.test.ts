import { describe, expect, it } from 'bun:test';
import type { Preferences } from '../stores/Preferences';
import { type ConnectionMode, ConnectionModes } from '../transports/Model';
import { Connectivity, type ConnectivityDeps, type ConnectivityRenderState } from './Connectivity';
import type { AuthSession } from './JellyfinAuthService';
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
	onOnline: number;
	onUserChanged: Array<string>;
}

function flush(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeConnectivity(over?: { hasStoredMode?: boolean; mode?: ConnectionMode }): {
	calls: Calls;
	connectivity: Connectivity;
	state: Array<Partial<ConnectivityRenderState>>;
} {
	const state: Array<Partial<ConnectivityRenderState>> = [];
	const calls: Calls = { onOnline: 0, onUserChanged: [] };

	const preferences = {
		hasStoredMode: over?.hasStoredMode ?? true,
		mode: over?.mode ?? ConnectionModes.offline,
		setMode: () => Promise.resolve(),
	} as unknown as Preferences;

	const sessionManager = {
		getEffectiveDeviceId: () => 'atolla-default',
		getSession: () => null,
		login: () => Promise.resolve(makeSession()),
		setMockMode: () => {},
	} as unknown as SessionManager;

	const deps: ConnectivityDeps = {
		applyState: (partial) => state.push(partial),
		downloadService: {} as ConnectivityDeps['downloadService'],
		onOnline: () => {
			calls.onOnline += 1;
		},
		onUserChanged: (userId) => calls.onUserChanged.push(userId),
		playlistCreateService: {} as ConnectivityDeps['playlistCreateService'],
		playlistEditService: {} as ConnectivityDeps['playlistEditService'],
		preferences,
		sessionManager,
		setNativeAuthToken: () => {},
		showToast: () => {},
	};

	return { calls, connectivity: new Connectivity(deps), state };
}

describe('Connectivity.bootstrap auth-required decision', () => {
	it('requires auth on a fresh install (offline default, mode never stored)', () => {
		const { connectivity, state } = makeConnectivity({
			hasStoredMode: false,
			mode: ConnectionModes.offline,
		});

		connectivity.bootstrap(null);

		expect(state[state.length - 1]?.isAuthRequired).toBe(true);
	});

	it('stays in the app when a returning user is offline with no session', () => {
		const { connectivity, state } = makeConnectivity({
			hasStoredMode: true,
			mode: ConnectionModes.offline,
		});

		connectivity.bootstrap(null);

		expect(state[state.length - 1]?.isAuthRequired).toBe(false);
	});

	it('requires auth after logout (online mode, no session)', () => {
		const { connectivity, state } = makeConnectivity({
			hasStoredMode: true,
			mode: ConnectionModes.online,
		});

		connectivity.bootstrap(null);

		expect(state[state.length - 1]?.isAuthRequired).toBe(true);
	});

	it('does not require auth when a valid session is restored', () => {
		const { connectivity, state } = makeConnectivity({
			hasStoredMode: false,
			mode: ConnectionModes.online,
		});

		connectivity.bootstrap(makeSession());

		expect(state[state.length - 1]?.isAuthRequired).toBe(false);
	});

	it('logging in from a fresh install lands in online mode, not offline', () => {
		const { connectivity, state } = makeConnectivity({
			hasStoredMode: false,
			mode: ConnectionModes.offline,
		});
		// fresh install: bootstrap leaves render state in the offline default on the connect screen
		connectivity.bootstrap(null);
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
		connectivity.bootstrap(null);

		connectivity.connect('https://server');
		await flush();

		expect(calls.onOnline).toBe(1);
		// the user scope must be activated before the reconnect sync runs
		expect(calls.onUserChanged).toEqual(['shared', 'user-1']);
	});
});
