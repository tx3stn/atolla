import { describe, expect, it } from 'bun:test';
import type { PersistentStore } from 'persistence/src/PersistentStore';
import { InMemoryAuthStore, JellyfinAuthStore, type StoredAuthSession } from './JellyfinAuthStore';

/** Minimal in-memory stand-in for the persistence layer's PersistentStore. */
class MockPersistentStore {
	readonly values = new Map<string, string>();

	fetchString(key: string): Promise<string> {
		const value = this.values.get(key);
		if (value == null) {
			return Promise.reject(new Error('missing key'));
		}
		return Promise.resolve(value);
	}

	storeString(key: string, value: string): Promise<void> {
		this.values.set(key, value);
		return Promise.resolve();
	}

	remove(key: string): Promise<void> {
		this.values.delete(key);
		return Promise.resolve();
	}
}

function createStore(): { store: JellyfinAuthStore; backing: MockPersistentStore } {
	const backing = new MockPersistentStore();
	return { backing, store: new JellyfinAuthStore(backing as unknown as PersistentStore) };
}

const validSession: StoredAuthSession = {
	accessToken: 'token-123',
	serverId: 'server-abc',
	serverName: 'Home Jellyfin',
	serverUrl: 'https://jellyfin.example.com',
	userId: 'user-xyz',
};

describe('JellyfinAuthStore', () => {
	describe('loadSession', () => {
		it('returns null when no session is persisted', async () => {
			const { store } = createStore();
			expect(await store.loadSession()).toBeNull();
		});

		it('returns the persisted session when all fields are present', async () => {
			const { store, backing } = createStore();
			backing.values.set('session', JSON.stringify(validSession));
			expect(await store.loadSession()).toEqual(validSession);
		});

		it('returns null when a required field is missing', async () => {
			const { store, backing } = createStore();
			const { accessToken, ...withoutToken } = validSession;
			backing.values.set('session', JSON.stringify(withoutToken));
			expect(await store.loadSession()).toBeNull();
		});

		it('returns null for malformed JSON', async () => {
			const { store, backing } = createStore();
			backing.values.set('session', 'not json');
			expect(await store.loadSession()).toBeNull();
		});
	});

	describe('saveSession', () => {
		it('persists the session and the normalized server url', async () => {
			const { store, backing } = createStore();
			await store.saveSession(validSession);

			expect(JSON.parse(backing.values.get('session') ?? '')).toEqual(validSession);
			expect(backing.values.get('server_url')).toBe('https://jellyfin.example.com');
		});

		it('throws for an invalid session shape', () => {
			const { store } = createStore();
			const invalid = {
				serverId: 'x',
				serverUrl: 'y',
				userId: 'z',
			} as unknown as StoredAuthSession;
			expect(store.saveSession(invalid)).rejects.toThrow('invalid session');
		});

		it('can be read back through loadSession', async () => {
			const { store } = createStore();
			await store.saveSession(validSession);
			expect(await store.loadSession()).toEqual(validSession);
		});
	});

	describe('server name', () => {
		it('persists and reads back the server name', async () => {
			const { store } = createStore();
			await store.saveSession({ ...validSession, serverName: 'Living Room Server' });
			expect((await store.loadSession())?.serverName).toBe('Living Room Server');
		});

		it('preserves an empty server name when the server has no name', async () => {
			const { store } = createStore();
			await store.saveSession({ ...validSession, serverName: '' });
			expect((await store.loadSession())?.serverName).toBe('');
		});

		it('returns null when the server name field is missing', async () => {
			const { store, backing } = createStore();
			const { serverName, ...withoutName } = validSession;
			backing.values.set('session', JSON.stringify(withoutName));
			expect(await store.loadSession()).toBeNull();
		});
	});

	describe('clearSession', () => {
		it('removes the persisted session', async () => {
			const { store, backing } = createStore();
			await store.saveSession(validSession);
			await store.clearSession();
			expect(backing.values.has('session')).toBe(false);
			expect(await store.loadSession()).toBeNull();
		});
	});

	describe('remembered server url', () => {
		it('returns empty string when none is stored', async () => {
			const { store } = createStore();
			expect(await store.loadRememberedServerUrl()).toBe('');
		});

		it('adds an https scheme when missing', async () => {
			const { store, backing } = createStore();
			await store.rememberServerUrl('jellyfin.example.com');
			expect(backing.values.get('server_url')).toBe('https://jellyfin.example.com');
		});

		it('preserves an existing http scheme', async () => {
			const { store, backing } = createStore();
			await store.rememberServerUrl('http://192.168.1.10:8096');
			expect(backing.values.get('server_url')).toBe('http://192.168.1.10:8096');
		});

		it('trims whitespace and strips trailing slashes', async () => {
			const { store, backing } = createStore();
			await store.rememberServerUrl('  https://jellyfin.example.com//  ');
			expect(backing.values.get('server_url')).toBe('https://jellyfin.example.com');
		});

		it('round-trips through loadRememberedServerUrl', async () => {
			const { store } = createStore();
			await store.rememberServerUrl('jellyfin.example.com');
			expect(await store.loadRememberedServerUrl()).toBe('https://jellyfin.example.com');
		});
	});
});

describe('InMemoryAuthStore', () => {
	it('round-trips a saved session', async () => {
		const store = new InMemoryAuthStore();
		await store.saveSession(validSession);
		expect(await store.loadSession()).toEqual(validSession);
		expect(await store.loadRememberedServerUrl()).toBe(validSession.serverUrl);
	});

	it('round-trips the server name', async () => {
		const store = new InMemoryAuthStore();
		const withName: StoredAuthSession = { ...validSession, serverName: 'Other Server' };
		await store.saveSession(withName);
		expect(await store.loadSession()).toEqual(withName);
	});

	it('clears a saved session', async () => {
		const store = new InMemoryAuthStore();
		await store.saveSession(validSession);
		await store.clearSession();
		expect(await store.loadSession()).toBeNull();
	});
});
