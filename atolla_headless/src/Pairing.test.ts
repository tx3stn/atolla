import { describe, expect, it } from 'bun:test';
import { InMemoryKeyValueStore, type KeyValueStore } from 'atolla_core/src/stores/KeyValueStore';
import { formatCode, loadPairing, PAIRING_KEY, resetPairing, verifyCode } from './Pairing';
import type { RandomBytes } from './Random';

function counting(start = 0): RandomBytes {
	let next = start;
	return (count) => Uint8Array.from({ length: count }, () => next++ & 0xff);
}

describe('loadPairing', () => {
	it('generates an 8 digit code when none is stored', async () => {
		const pairing = await loadPairing(new InMemoryKeyValueStore(), counting());

		expect(pairing.code).toMatch(/^\d{8}$/);
	});

	it('persists the generated code so it survives a restart', async () => {
		const store = new InMemoryKeyValueStore();

		const first = await loadPairing(store, counting());
		const second = await loadPairing(store, counting(3));

		expect(second.code).toBe(first.code);
	});

	it('starts with no paired controllers', async () => {
		expect((await loadPairing(new InMemoryKeyValueStore(), counting())).controllers).toEqual([]);
	});

	it('keeps controllers that were already stored', async () => {
		const store = new InMemoryKeyValueStore();
		await store.storeString(
			PAIRING_KEY,
			JSON.stringify({ code: '12345678', controllers: [{ id: 'c1', name: 'Phone' }] }),
		);

		expect((await loadPairing(store, counting())).controllers).toEqual([
			{ id: 'c1', name: 'Phone' },
		]);
	});

	it('replaces a stored code that is not 8 digits', async () => {
		const store = new InMemoryKeyValueStore();
		await store.storeString(PAIRING_KEY, JSON.stringify({ code: '123', controllers: [] }));

		expect((await loadPairing(store, counting())).code).toMatch(/^\d{8}$/);
	});

	it('replaces unparseable stored pairing state', async () => {
		const store = new InMemoryKeyValueStore();
		await store.storeString(PAIRING_KEY, 'not json');

		expect((await loadPairing(store, counting())).code).toMatch(/^\d{8}$/);
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
		await store.storeString(
			PAIRING_KEY,
			JSON.stringify({ code: '12345678', controllers: [{ id: 'c1', name: 'Phone' }] }),
		);

		expect((await resetPairing(store, counting())).controllers).toEqual([]);
	});
});

describe('formatCode', () => {
	it('groups the code into two blocks of four', () => {
		expect(formatCode('12345678')).toBe('1234 5678');
	});
});

describe('verifyCode', () => {
	const pairing = { code: '12345678', controllers: [] };

	it('accepts the bare code', () => {
		expect(verifyCode(pairing, '12345678')).toBe(true);
	});

	it('accepts the code as it is displayed', () => {
		expect(verifyCode(pairing, formatCode('12345678'))).toBe(true);
	});

	it('accepts a code retyped with stray whitespace', () => {
		expect(verifyCode(pairing, '  1234  5678 ')).toBe(true);
	});

	it('rejects a different code', () => {
		expect(verifyCode(pairing, '87654321')).toBe(false);
	});

	it('rejects a code that only shares a prefix', () => {
		expect(verifyCode(pairing, '1234')).toBe(false);
	});
});
