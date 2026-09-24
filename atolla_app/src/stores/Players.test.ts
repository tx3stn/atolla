import { describe, expect, it } from 'bun:test';
import { InMemoryKeyValueStore, type KeyValueStore } from 'atolla_core/src/stores/KeyValueStore';
import { DEFAULT_PLAYER_GROUP, type Player, PlayerStates, PlayerTiers } from '../models/Player';
import { PlayerErrors } from '../services/PlayerErrors';
import { PLAYERS_ORDER_KEY, PlayersStore, REFUSED_PAIRING_CODE } from './Players';

describe('PlayersStore', () => {
	it('flips a player enabled and tells subscribers', () => {
		const store = new PlayersStore({ pairDelayMs: 0, seed: [makePlayer('a', { enabled: false })] });
		let notifications = 0;
		store.subscribe(() => {
			notifications += 1;
		});

		store.setEnabled('a', true);

		expect(store.sections()[0].players[0].enabled).toBe(true);
		expect(notifications).toBe(1);
	});

	it('ignores setEnabled for an id it does not hold', () => {
		const store = new PlayersStore({ pairDelayMs: 0, seed: [makePlayer('a')] });
		let notifications = 0;
		store.subscribe(() => {
			notifications += 1;
		});

		store.setEnabled('nope', false);

		expect(notifications).toBe(0);
	});

	it('stops telling a subscriber once it unsubscribes', () => {
		const store = new PlayersStore({ pairDelayMs: 0, seed: [makePlayer('a', { enabled: false })] });
		let notifications = 0;
		const unsubscribe = store.subscribe(() => {
			notifications += 1;
		});

		unsubscribe();
		store.setEnabled('a', true);

		expect(notifications).toBe(0);
	});

	it('gives a paired player an id nothing else holds', async () => {
		const store = new PlayersStore({ pairDelayMs: 0, seed: [makePlayer('a')] });

		const first = await store.add('12345678');
		const second = await store.add('87654321');

		expect(second.id).not.toBe(first.id);
	});

	it('refuses the reserved code with an invalid pairing code error, adding nothing', async () => {
		const store = new PlayersStore({ pairDelayMs: 0, seed: [makePlayer('a')] });

		await expect(store.add(REFUSED_PAIRING_CODE)).rejects.toBe(PlayerErrors.INVALID_PAIRING_CODE);
		expect(ids(store)).toEqual(['a']);
	});

	it('forgets a player and tells subscribers', () => {
		const store = new PlayersStore({ pairDelayMs: 0, seed: [makePlayer('a'), makePlayer('b')] });
		let notifications = 0;
		store.subscribe(() => {
			notifications += 1;
		});

		store.forget('a');

		expect(ids(store)).toEqual(['b']);
		expect(notifications).toBe(1);
	});

	it('refuses to forget this device', () => {
		const store = new PlayersStore({
			pairDelayMs: 0,
			seed: [makePlayer('a', { isThisDevice: true })],
		});

		store.forget('a');

		expect(ids(store)).toEqual(['a']);
	});
});

describe('PlayersStore reorder', () => {
	it('moves a player up the list and tells subscribers', () => {
		const store = new PlayersStore({
			pairDelayMs: 0,
			seed: [makePlayer('a'), makePlayer('b'), makePlayer('c')],
		});
		let notifications = 0;
		store.subscribe(() => {
			notifications += 1;
		});

		store.reorder(2, 0);

		expect(ids(store)).toEqual(['c', 'a', 'b']);
		expect(notifications).toBe(1);
	});

	it('moves a player down the list', () => {
		const store = new PlayersStore({
			pairDelayMs: 0,
			seed: [makePlayer('a'), makePlayer('b'), makePlayer('c')],
		});

		store.reorder(0, 2);

		expect(ids(store)).toEqual(['b', 'c', 'a']);
	});

	it('reorders against the current order, not the seed order', () => {
		const store = new PlayersStore({
			pairDelayMs: 0,
			seed: [makePlayer('a'), makePlayer('b'), makePlayer('c')],
		});

		store.reorder(2, 0);
		store.reorder(1, 2);

		expect(ids(store)).toEqual(['c', 'b', 'a']);
	});

	it('does nothing when the indices match', () => {
		const store = new PlayersStore({ pairDelayMs: 0, seed: [makePlayer('a'), makePlayer('b')] });
		let notifications = 0;
		store.subscribe(() => {
			notifications += 1;
		});

		store.reorder(1, 1);

		expect(ids(store)).toEqual(['a', 'b']);
		expect(notifications).toBe(0);
	});

	it.each([
		['a source past the end', 5, 0],
		['a negative source', -1, 0],
		['a destination past the end', 0, 5],
		['a negative destination', 1, -1],
	])('does nothing for %s', (_label, fromIndex, toIndex) => {
		const store = new PlayersStore({ pairDelayMs: 0, seed: [makePlayer('a'), makePlayer('b')] });
		let notifications = 0;
		store.subscribe(() => {
			notifications += 1;
		});

		store.reorder(fromIndex, toIndex);

		expect(ids(store)).toEqual(['a', 'b']);
		expect(notifications).toBe(0);
	});
});

describe('PlayersStore persisted order', () => {
	it('restores a saved order on reload', async () => {
		const keyValueStore = new InMemoryKeyValueStore();
		const seed = [makePlayer('a'), makePlayer('b'), makePlayer('c')];
		new PlayersStore({ pairDelayMs: 0, seed, store: keyValueStore }).reorder(2, 0);

		const reloaded = new PlayersStore({ pairDelayMs: 0, seed, store: keyValueStore });
		await reloaded.ensureLoaded();

		expect(ids(reloaded)).toEqual(['c', 'a', 'b']);
	});

	it('keeps the seed order when nothing was ever saved', async () => {
		const store = new PlayersStore({ pairDelayMs: 0, seed: [makePlayer('a'), makePlayer('b')] });

		await store.ensureLoaded();

		expect(ids(store)).toEqual(['a', 'b']);
	});

	it('keeps the seed order when the saved blob is unreadable', async () => {
		const keyValueStore = new InMemoryKeyValueStore();
		await keyValueStore.storeString(PLAYERS_ORDER_KEY, 'not json');

		const store = new PlayersStore({
			pairDelayMs: 0,
			seed: [makePlayer('a'), makePlayer('b')],
			store: keyValueStore,
		});
		await store.ensureLoaded();

		expect(ids(store)).toEqual(['a', 'b']);
	});

	it('keeps the seed order when the saved blob is a version it does not know', async () => {
		const keyValueStore = new InMemoryKeyValueStore();
		await keyValueStore.storeString(
			PLAYERS_ORDER_KEY,
			JSON.stringify({ order: ['b', 'a'], version: 2 }),
		);

		const store = new PlayersStore({
			pairDelayMs: 0,
			seed: [makePlayer('a'), makePlayer('b')],
			store: keyValueStore,
		});
		await store.ensureLoaded();

		expect(ids(store)).toEqual(['a', 'b']);
	});

	it('reads from disk only once', async () => {
		const keyValueStore = new InMemoryKeyValueStore();
		await keyValueStore.storeString(
			PLAYERS_ORDER_KEY,
			JSON.stringify({ order: ['b', 'a'], version: 1 }),
		);
		let reads = 0;
		const counted = {
			fetchString: (key: string) => {
				reads += 1;
				return keyValueStore.fetchString(key);
			},
			storeString: (key: string, value: string) => keyValueStore.storeString(key, value),
		};

		const store = new PlayersStore({
			pairDelayMs: 0,
			seed: [makePlayer('a'), makePlayer('b')],
			store: counted,
		});
		await Promise.all([store.ensureLoaded(), store.ensureLoaded()]);
		await store.ensureLoaded();

		expect(reads).toBe(1);
	});

	it('tells subscribers once a saved order lands', async () => {
		const keyValueStore = new InMemoryKeyValueStore();
		await keyValueStore.storeString(
			PLAYERS_ORDER_KEY,
			JSON.stringify({ order: ['b', 'a'], version: 1 }),
		);
		const store = new PlayersStore({
			pairDelayMs: 0,
			seed: [makePlayer('a'), makePlayer('b')],
			store: keyValueStore,
		});
		let notifications = 0;
		store.subscribe(() => {
			notifications += 1;
		});

		await store.ensureLoaded();

		expect(notifications).toBe(1);
	});

	it('lets a reorder made before the load lands win over the saved order', async () => {
		const keyValueStore = new InMemoryKeyValueStore();
		await keyValueStore.storeString(
			PLAYERS_ORDER_KEY,
			JSON.stringify({ order: ['c', 'b', 'a'], version: 1 }),
		);
		const store = new PlayersStore({
			pairDelayMs: 0,
			seed: [makePlayer('a'), makePlayer('b'), makePlayer('c')],
			store: keyValueStore,
		});

		const loading = store.ensureLoaded();
		store.reorder(0, 1);
		await loading;

		expect(ids(store)).toEqual(['b', 'a', 'c']);
	});

	it('sorts a player the saved order has never seen to the bottom', async () => {
		const keyValueStore = new InMemoryKeyValueStore();
		await keyValueStore.storeString(
			PLAYERS_ORDER_KEY,
			JSON.stringify({ order: ['c', 'b'], version: 1 }),
		);

		const store = new PlayersStore({
			pairDelayMs: 0,
			seed: [makePlayer('a'), makePlayer('b'), makePlayer('c')],
			store: keyValueStore,
		});
		await store.ensureLoaded();

		expect(ids(store)).toEqual(['c', 'b', 'a']);
	});

	it('puts a newly paired player at the bottom of a saved order', async () => {
		const keyValueStore = new InMemoryKeyValueStore();
		const store = new PlayersStore({
			pairDelayMs: 0,
			seed: [makePlayer('a'), makePlayer('b')],
			store: keyValueStore,
		});
		store.reorder(1, 0);

		const paired = await store.add('12345678');

		expect(ids(store)).toEqual(['b', 'a', paired.id]);
	});

	it('drops a forgotten player from the order on the next write', async () => {
		const keyValueStore = new InMemoryKeyValueStore();
		const store = new PlayersStore({
			pairDelayMs: 0,
			seed: [makePlayer('a'), makePlayer('b'), makePlayer('c')],
			store: keyValueStore,
		});
		store.reorder(2, 0);

		store.forget('a');
		store.reorder(1, 0);

		expect(await savedOrder(keyValueStore)).toEqual(['b', 'c']);
	});
});

function ids(store: PlayersStore): Array<string> {
	return store.sections().flatMap((section) => section.players.map((player) => player.id));
}

function makePlayer(id: string, overrides: Partial<Player> = {}): Player {
	return {
		address: '192.168.1.42',
		enabled: true,
		group: DEFAULT_PLAYER_GROUP,
		icon: null,
		id,
		isThisDevice: false,
		lastError: null,
		name: `Player ${id}`,
		reachable: true,
		state: PlayerStates.idle,
		tier: PlayerTiers.tight,
		...overrides,
	};
}

async function savedOrder(store: KeyValueStore): Promise<Array<string>> {
	const parsed = JSON.parse(await store.fetchString(PLAYERS_ORDER_KEY)) as { order: Array<string> };
	return parsed.order;
}
