import { describe, expect, it } from 'bun:test';
import { InMemoryKeyValueStore, type KeyValueStore } from 'atolla_core/src/stores/KeyValueStore';
import {
	CONTROLLERS_KEY,
	formatCode,
	loadPairing,
	PAIRING_KEY,
	type PairedController,
	resetPairing,
} from './Pairing';
import type { RandomBytes } from './Random';

const CONTROLLER: PairedController = {
	controllerId: 'c1',
	controllerName: 'Phone',
	pairedAt: 1756857600000,
	token: 'a3f1c85da3f1c85da3f1c85da3f1c85da3f1c85da3f1c85da3f1c85da3f1c85d',
};

function counting(start = 0): RandomBytes {
	let next = start;
	return (count) => Uint8Array.from({ length: count }, () => next++ & 0xff);
}

describe('loadPairing', () => {
	it('generates an 8 digit code when none is stored', async () => {
		const pairing = await loadPairing(new InMemoryKeyValueStore(), counting());

		expect(pairing.code).toMatch(/^\d{8}$/);
	});

	it('stores the code as bare digits so a credentials file needs no parsing', async () => {
		const store = new InMemoryKeyValueStore();

		const pairing = await loadPairing(store, counting());

		expect(await store.fetchString(PAIRING_KEY)).toBe(pairing.code);
	});

	it('persists the generated code so it survives a restart', async () => {
		const store = new InMemoryKeyValueStore();

		const first = await loadPairing(store, counting());
		const second = await loadPairing(store, counting(3));

		expect(second.code).toBe(first.code);
	});

	it('accepts a stored code surrounded by whitespace', async () => {
		const store = new InMemoryKeyValueStore();
		await store.storeString(PAIRING_KEY, ' 12345678\n');

		expect((await loadPairing(store, counting())).code).toBe('12345678');
	});

	it('starts with no paired controllers', async () => {
		expect((await loadPairing(new InMemoryKeyValueStore(), counting())).controllers).toEqual([]);
	});

	it('does not write a controllers file it has nothing to put in', async () => {
		const store = new InMemoryKeyValueStore();

		await loadPairing(store, counting());

		expect(await store.exists(CONTROLLERS_KEY)).toBe(false);
	});

	it('reads controllers from their own key', async () => {
		const store = new InMemoryKeyValueStore();
		await store.storeString(PAIRING_KEY, '12345678');
		await store.storeString(CONTROLLERS_KEY, JSON.stringify([CONTROLLER]));

		expect((await loadPairing(store, counting())).controllers).toEqual([CONTROLLER]);
	});

	it('replaces a stored code that is not 8 digits', async () => {
		const store = new InMemoryKeyValueStore();
		await store.storeString(PAIRING_KEY, '123');

		expect((await loadPairing(store, counting())).code).toMatch(/^\d{8}$/);
	});

	it('keeps the code readable when the controllers file is corrupt', async () => {
		const store = new InMemoryKeyValueStore();
		await store.storeString(PAIRING_KEY, '12345678');
		await store.storeString(CONTROLLERS_KEY, 'not json');

		const pairing = await loadPairing(store, counting());

		expect(pairing.code).toBe('12345678');
		expect(pairing.controllers).toEqual([]);
	});

	it('rejects when the code cannot be persisted', async () => {
		const store: KeyValueStore = {
			fetchString: () => Promise.reject(new Error('missing key')),
			storeString: () => Promise.reject(new Error('read-only file system')),
		};

		expect(loadPairing(store, counting())).rejects.toThrow();
	});
});

describe('resetPairing', () => {
	it('rotates the code', async () => {
		const store = new InMemoryKeyValueStore();
		const before = await loadPairing(store, counting());

		expect((await resetPairing(store, counting(3))).code).not.toBe(before.code);
	});

	it('persists the rotated code', async () => {
		const store = new InMemoryKeyValueStore();
		await loadPairing(store, counting());

		const reset = await resetPairing(store, counting(3));

		expect((await loadPairing(store, counting(6))).code).toBe(reset.code);
	});

	it('forgets paired controllers', async () => {
		const store = new InMemoryKeyValueStore();
		await store.storeString(CONTROLLERS_KEY, JSON.stringify([CONTROLLER]));

		expect((await resetPairing(store, counting())).controllers).toEqual([]);
	});

	it('empties the stored controllers file', async () => {
		const store = new InMemoryKeyValueStore();
		await store.storeString(CONTROLLERS_KEY, JSON.stringify([CONTROLLER]));

		await resetPairing(store, counting());

		expect(JSON.parse(await store.fetchString(CONTROLLERS_KEY))).toEqual([]);
	});
});

describe('formatCode', () => {
	it('groups the code into two blocks of four', () => {
		expect(formatCode('12345678')).toBe('1234 5678');
	});
});
