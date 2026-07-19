import { describe, expect, it } from 'bun:test';
import type { IHTTPClient } from 'valdi_http/src/IHTTPClient';
import type { Preferences } from '../stores/Preferences';
import { AuthErrors } from './AuthErrors';
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
		setClient: () => {},
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
		createHttpClient: () => ({}) as unknown as IHTTPClient,
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
			authService: { startQuickConnect: () => Promise.reject(AuthErrors.CONNECTION_ERROR) },
		});

		await expect(manager.login('https://server')).rejects.toThrow();
		expect(manager.getSession()).toBeNull();
		expect(calls.onSessionChanged).toEqual([]);
		expect(calls.applyState).toContainEqual({
			authErrorMessage: AuthErrors.CONNECTION_ERROR,
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

	it('cancelLogin clears the spinner, the code and any error in a single update', () => {
		const { calls, manager } = makeManager();

		manager.cancelLogin();

		// one partial, not three: an intermediate render with isAuthenticating still true would
		// leave the connect button disabled while the user is trying to retype the url
		expect(calls.applyState).toEqual([
			{ authErrorMessage: null, isAuthenticating: false, quickConnectCode: null },
		]);
	});

	it('a canceled login stops writing render state', async () => {
		let release: (value: { code: string; secret: string }) => void = () => {};
		const { calls, manager } = makeManager({
			authService: {
				startQuickConnect: () => new Promise((resolve) => (release = resolve)),
			},
		});

		const pending = manager.login('https://server');
		await flush();
		manager.cancelLogin();
		const applyCountAtCancel = calls.applyState.length;
		release({ code: 'CODE', secret: 'SECRET' });

		await expect(pending).rejects.toHaveProperty('err', AuthErrors.LOGIN_CANCELED.err);
		expect(calls.applyState.length).toBe(applyCountAtCancel);
	});

	// the user is mid-edit when the abandoned request fails; surfacing its error would put a stale
	// message under the field they are already fixing
	it('a canceled login stays silent when its request fails afterwards', async () => {
		let failIt: (reason: unknown) => void = () => {};
		const { calls, manager } = makeManager({
			authService: {
				startQuickConnect: () => new Promise((_resolve, reject) => (failIt = reject)),
			},
		});

		const pending = manager.login('https://server');
		await flush();
		manager.cancelLogin();
		failIt(AuthErrors.CONNECTION_ERROR);

		await expect(pending).rejects.toBeDefined();
		expect(calls.applyState.filter((s) => s.authErrorMessage != null)).toEqual([]);
	});

	it('a canceled login neither saves nor adopts the session', async () => {
		let saved = 0;
		let release: () => void = () => {};
		const { calls, manager } = makeManager({
			authService: {
				saveSession: () => {
					saved += 1;
					return Promise.resolve();
				},
				waitForQuickConnectApproval: () => new Promise<void>((resolve) => (release = resolve)),
			},
		});

		const pending = manager.login('https://server');
		await flush();
		manager.cancelLogin();
		release();

		await expect(pending).rejects.toHaveProperty('err', AuthErrors.LOGIN_CANCELED.err);
		expect(saved).toBe(0);
		expect(manager.getSession()).toBeNull();
		expect(calls.onSessionChanged).toEqual([]);
	});

	it('cancelLogin signals the in-flight approval wait to stop polling', async () => {
		let isCancelled: (() => boolean) | undefined;
		let release: () => void = () => {};
		const { manager } = makeManager({
			authService: {
				waitForQuickConnectApproval: (
					_secret: string,
					_timeoutMs?: number,
					_pollIntervalMs?: number,
					options?: { isCancelled?: () => boolean },
				) => {
					isCancelled = options?.isCancelled;
					return new Promise<void>((resolve) => (release = resolve));
				},
			},
		});

		const pending = manager.login('https://server');
		await flush();

		expect(isCancelled?.()).toBe(false);
		manager.cancelLogin();
		expect(isCancelled?.()).toBe(true);
		release();

		await expect(pending).rejects.toHaveProperty('err', AuthErrors.LOGIN_CANCELED.err);
	});

	it('a superseded login cannot clobber the attempt that replaced it', async () => {
		let failFirst: (reason: unknown) => void = () => {};
		let first = true;
		const { calls, manager } = makeManager({
			authService: {
				startQuickConnect: () => {
					if (first) {
						first = false;
						return new Promise((_resolve, reject) => (failFirst = reject));
					}
					return Promise.resolve({ code: 'CODE', secret: 'SECRET' });
				},
			},
		});

		const stale = manager.login('https://first');
		await flush();
		const winner = manager.login('https://second');
		failFirst(AuthErrors.CONNECTION_ERROR);

		await expect(stale).rejects.toBeDefined();
		await expect(winner).resolves.toBeDefined();
		expect(calls.applyState.filter((s) => s.authErrorMessage != null)).toEqual([]);
	});

	// a non-ErrorConst reaching the view crashes it: ConnectionView renders errorMessage.msg()
	it('login maps an unexpected throw to a renderable error', async () => {
		const { calls, manager } = makeManager({
			authService: { rememberServerUrl: () => Promise.reject(new TypeError('store gone')) },
		});

		await expect(manager.login('https://server')).rejects.toBeDefined();

		const surfaced = calls.applyState.find((s) => s.authErrorMessage != null)?.authErrorMessage;
		expect(surfaced?.err).toBe(AuthErrors.CONNECTION_ERROR.err);
		expect(surfaced?.msg()).toBe('connection error: store gone');
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
