import { describe, expect, it } from 'bun:test';
import type { Preferences } from '../stores/Preferences';
import type { AuthSession, JellyfinAuthService } from './JellyfinAuthService';
import { type AuthRenderState, SessionManager, type SessionManagerDeps } from './SessionManager';

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
	applyState: Array<Partial<AuthRenderState>>;
	onSessionChanged: Array<AuthSession | null>;
	setClientDeviceId: Array<string>;
	showToast: Array<string>;
}

function makeManager(over?: {
	authService?: Partial<JellyfinAuthService>;
	deviceIdOverride?: string;
}): { calls: Calls; manager: SessionManager } {
	const calls: Calls = {
		applyState: [],
		onSessionChanged: [],
		setClientDeviceId: [],
		showToast: [],
	};

	const authService = {
		authenticateWithQuickConnect: () => Promise.resolve(makeSession()),
		clearSession: () => Promise.resolve(),
		errorMessage: () => 'failed',
		loadRememberedServerUrl: () => Promise.resolve(''),
		loadSession: () => Promise.resolve(null),
		probeInitialAlbums: () => Promise.resolve(),
		rememberServerUrl: () => Promise.resolve(),
		saveSession: () => Promise.resolve(),
		setClientDeviceId: (id: string) => calls.setClientDeviceId.push(id),
		setMockMode: () => {},
		startQuickConnect: () => Promise.resolve({ code: 'CODE', secret: 'SECRET' }),
		validateSession: () => Promise.resolve(true),
		waitForQuickConnectApproval: () => Promise.resolve(),
		...over?.authService,
	} as unknown as JellyfinAuthService;

	const preferences = {
		jellyfinClientDeviceIdOverride: over?.deviceIdOverride ?? '',
	} as unknown as Preferences;

	const deps: SessionManagerDeps = {
		applyState: (partial) => calls.applyState.push(partial),
		authService,
		defaultDeviceId: 'atolla-default',
		onSessionChanged: (session) => calls.onSessionChanged.push(session),
		preferences,
		showToast: (message) => calls.showToast.push(message),
	};

	return { calls, manager: new SessionManager(deps) };
}

function flush(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('SessionManager', () => {
	it('loadSession restores the session and primes the auth render state', async () => {
		const { calls, manager } = makeManager({
			authService: {
				loadRememberedServerUrl: () => Promise.resolve('https://prev'),
				loadSession: () => Promise.resolve(makeSession()),
			},
		});

		const session = await manager.loadSession();

		expect(session?.userId).toBe('user-1');
		expect(manager.getSession()?.userId).toBe('user-1');
		expect(manager.getAccessToken()).toBe('tok');
		expect(calls.applyState).toContainEqual({
			serverName: 'Home',
			serverUrlPrefill: 'https://prev',
		});
	});

	it('login runs quick-connect, sets the session, emits onSessionChanged, and toasts', async () => {
		const { calls, manager } = makeManager();

		const session = await manager.login('https://server');

		expect(session.userId).toBe('user-1');
		expect(manager.getSession()?.userId).toBe('user-1');
		expect(calls.onSessionChanged).toEqual([session]);
		expect(calls.showToast).toContain('connected');
		const codes = calls.applyState.flatMap((s) =>
			'quickConnectCode' in s ? [s.quickConnectCode] : [],
		);
		expect(codes).toContain('CODE');
	});

	it('login surfaces the error and rethrows without changing the session on failure', async () => {
		const { calls, manager } = makeManager({
			authService: { startQuickConnect: () => Promise.reject(new Error('nope')) },
		});

		await expect(manager.login('https://server')).rejects.toThrow();
		expect(manager.getSession()).toBeNull();
		expect(calls.onSessionChanged).toEqual([]);
		expect(calls.applyState).toContainEqual({
			authErrorMessage: 'failed',
			isAuthenticating: false,
			quickConnectCode: null,
		});
	});

	it('clearSession drops the session and emits onSessionChanged(null)', async () => {
		const { calls, manager } = makeManager({
			authService: { loadSession: () => Promise.resolve(makeSession()) },
		});
		await manager.loadSession();

		await manager.clearSession();

		expect(manager.getSession()).toBeNull();
		expect(calls.onSessionChanged).toEqual([null]);
	});

	it('applyDeviceIdOverride normalises, updates the auth client id, and reloads on an active session', async () => {
		const { calls, manager } = makeManager({
			authService: { loadSession: () => Promise.resolve(makeSession()) },
		});
		await manager.loadSession();
		calls.onSessionChanged.length = 0;

		manager.applyDeviceIdOverride('bad id!@#');

		expect(manager.getEffectiveDeviceId()).toBe('bad_id___');
		expect(calls.setClientDeviceId).toContain('bad_id___');
		expect(calls.onSessionChanged.length).toBe(1);
	});

	it('getEffectiveDeviceId falls back to the default with no override', () => {
		const { manager } = makeManager();
		expect(manager.getEffectiveDeviceId()).toBe('atolla-default');
	});

	it('login keeps the session online and never runs a follow-up check that could drop it', async () => {
		// even if a background /Users/Me check would fail, login must stay online: the auth exchange
		// and probeInitialAlbums already validated the token, and a fresh install has no downloads to
		// fall back to, so dropping to offline would leave an empty app.
		const { calls, manager } = makeManager({
			authService: { validateSession: () => Promise.resolve(false) },
		});

		const session = await manager.login('https://server');
		await flush();

		expect(manager.getSession()?.userId).toBe('user-1');
		expect(calls.onSessionChanged).toEqual([session]);
	});
});
