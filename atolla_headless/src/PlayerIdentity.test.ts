import { describe, expect, it } from 'bun:test';
import { InMemoryKeyValueStore, type KeyValueStore } from 'atolla_core/src/stores/KeyValueStore';
import { version } from 'atolla_core/src/version';
import { IDENTITY_KEY, loadPlayerIdentity } from './PlayerIdentity';
import type { RandomBytes } from './Random';

function counting(start = 0): RandomBytes {
	let next = start;
	return (count) => Uint8Array.from({ length: count }, () => next++ & 0xff);
}

describe('loadPlayerIdentity', () => {
	it('generates a 16 character hex id when none is stored', async () => {
		const identity = await loadPlayerIdentity(new InMemoryKeyValueStore(), counting(), 'Kitchen');

		expect(identity.id).toMatch(/^[0-9a-f]{16}$/);
	});

	it('persists the generated id so it survives a restart', async () => {
		const store = new InMemoryKeyValueStore();

		const first = await loadPlayerIdentity(store, counting(), 'Kitchen');
		const second = await loadPlayerIdentity(store, counting(9), 'Kitchen');

		expect(second.id).toBe(first.id);
	});

	it('reuses a stored id rather than generating a new one', async () => {
		const store = new InMemoryKeyValueStore();
		await store.storeString(IDENTITY_KEY, 'a1b2c3d4e5f60718');

		expect((await loadPlayerIdentity(store, counting(), 'Kitchen')).id).toBe('a1b2c3d4e5f60718');
	});

	it('replaces a stored id that is not a player id', async () => {
		const store = new InMemoryKeyValueStore();
		await store.storeString(IDENTITY_KEY, 'truncated');

		const identity = await loadPlayerIdentity(store, counting(), 'Kitchen');

		expect(identity.id).toMatch(/^[0-9a-f]{16}$/);
		expect(await store.fetchString(IDENTITY_KEY)).toBe(identity.id);
	});

	it('carries the configured name, the build version and the tight sync tier', async () => {
		const identity = await loadPlayerIdentity(new InMemoryKeyValueStore(), counting(), 'Kitchen');

		expect(identity.name).toBe('Kitchen');
		expect(identity.version).toBe(version);
		expect(identity.tier).toBe('tight');
	});

	// an id that changes every boot would break every member keyed on it, so a daemon that cannot
	// persist one must fail rather than carry on with a fresh one
	it('rejects when the id cannot be persisted', async () => {
		const store: KeyValueStore = {
			fetchString: () => Promise.reject(new Error('missing key')),
			storeString: () => Promise.reject(new Error('read-only file system')),
		};

		expect(loadPlayerIdentity(store, counting(), 'Kitchen')).rejects.toThrow();
	});
});
