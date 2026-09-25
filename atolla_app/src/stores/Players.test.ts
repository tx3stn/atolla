import { describe, expect, it } from 'bun:test';
import { InMemoryKeyValueStore, type KeyValueStore } from 'atolla_core/src/stores/KeyValueStore';
import type { Hello, PairAccepted, PairRequest, Problem } from 'atolla_sync/src/api/generated';
import type { PlayerAnswer } from 'atolla_sync/src/api/PlayerClient';
import {
	DEFAULT_PLAYER_GROUP,
	type Player,
	PlayerStates,
	PlayerTiers,
	type ProbedPlayer,
} from '../models/Player';
import { PlayerErrors } from '../services/PlayerErrors';
import { PLAYERS_KEY, PLAYERS_ORDER_KEY, type PlayerClientPort, PlayersStore } from './Players';

describe('PlayersStore pair', () => {
	const KITCHEN: ProbedPlayer = {
		baseUrl: 'http://192.168.1.42:45889',
		id: '0123456789abcdef',
		name: 'Kitchen',
	};

	function pairing(answer: () => Promise<PlayerAnswer<unknown>>, store?: KeyValueStore) {
		const sent: Array<PairRequest> = [];

		return {
			sent,
			store: new PlayersStore({
				controllerId: () => 'atolla-phone-1',
				createClient: () => ({
					hello: () => {
						throw new Error('pairing does not greet the player again');
					},
					pair: (body: PairRequest) => {
						sent.push(body);
						return answer() as ReturnType<PlayerClientPort['pair']>;
					},
				}),
				deviceName: () => 'Pixel 9 Pro',
				store,
			}),
		};
	}

	function accepted(): () => Promise<PlayerAnswer<PairAccepted>> {
		return () => Promise.resolve({ headers: {}, json: { token: 'a'.repeat(64) }, status: 200 });
	}

	function refused(status: number, problem: Partial<Problem>) {
		return () =>
			Promise.resolve({
				headers: {},
				json: { code: 'invalid_pairing_code', status, title: 'x', ...problem },
				status,
			});
	}

	it('puts a paired player in the list under the name it reported', async () => {
		const { store } = pairing(accepted());

		const player = await store.pair(KITCHEN, '12345678');

		expect(player.name).toBe('Kitchen');
		expect(player.baseUrl).toBe('http://192.168.1.42:45889');
		expect(ids(store)).toEqual(['this-device', '0123456789abcdef']);
	});

	it('identifies this phone to the daemon', async () => {
		const { sent, store } = pairing(accepted());

		await store.pair(KITCHEN, '12345678');

		expect(sent).toEqual([
			{ code: '12345678', controllerId: 'atolla-phone-1', controllerName: 'Pixel 9 Pro' },
		]);
	});

	it('keeps the token out of the player the views see', async () => {
		const { store } = pairing(accepted());

		const player = await store.pair(KITCHEN, '12345678');

		expect(Object.values(player)).not.toContain('a'.repeat(64));
	});

	it('restores a paired player, and its token, after a reload', async () => {
		const keyValueStore = new InMemoryKeyValueStore();
		const { store } = pairing(accepted(), keyValueStore);
		await store.pair(KITCHEN, '12345678');

		const reloaded = new PlayersStore({ store: keyValueStore });
		await reloaded.ensureLoaded();

		expect(ids(reloaded)).toEqual(['this-device', '0123456789abcdef']);
		expect(reloaded.tokenFor('0123456789abcdef')).toBe('a'.repeat(64));
	});

	it('refuses a wrong code and adds nothing', async () => {
		const { store } = pairing(refused(401, { code: 'invalid_pairing_code' }));

		await expect(store.pair(KITCHEN, '00000000')).rejects.toMatchObject({
			err: 'invalid_pairing_code',
		});
		expect(ids(store)).toEqual(['this-device']);
	});

	it('reports a throttled attempt as its own refusal, carrying the wait', async () => {
		const { store } = pairing(refused(429, { code: 'too_many_attempts', retryAfterSeconds: 4 }));

		await expect(store.pair(KITCHEN, '12345678')).rejects.toMatchObject({
			detail: '4',
			err: 'too_many_attempts',
		});
	});

	it('reports a daemon that stopped answering as unreachable', async () => {
		const { store } = pairing(() => Promise.reject(new Error('gone')));

		await expect(store.pair(KITCHEN, '12345678')).rejects.toBe(PlayerErrors.PLAYER_UNREACHABLE);
	});

	it('replaces the record when the same player is paired again', async () => {
		const keyValueStore = new InMemoryKeyValueStore();
		const { store } = pairing(accepted(), keyValueStore);

		await store.pair(KITCHEN, '12345678');
		await store.pair({ ...KITCHEN, name: 'Kitchen Speaker' }, '87654321');

		expect(ids(store)).toEqual(['this-device', '0123456789abcdef']);
		expect(store.sections()[0].players[1].name).toBe('Kitchen Speaker');
	});

	it('drops the token when a player is forgotten', async () => {
		const { store } = pairing(accepted());
		await store.pair(KITCHEN, '12345678');

		store.forget('0123456789abcdef');

		expect(store.tokenFor('0123456789abcdef')).toBe(undefined);
	});
});

describe('PlayersStore probe', () => {
	function hello(overrides: Partial<Hello> = {}): Hello {
		return {
			apiVersions: [1],
			id: '0123456789abcdef',
			name: 'Kitchen',
			tier: 'tight',
			v: 1,
			version: '0.1.0',
			...overrides,
		};
	}

	function probing(answer: () => Promise<PlayerAnswer<unknown>>) {
		const asked: Array<string> = [];

		return {
			asked,
			store: new PlayersStore({
				createClient: (baseUrl: string) => {
					asked.push(baseUrl);
					return {
						hello: () => answer() as ReturnType<PlayerClientPort['hello']>,
						pair: () => {
							throw new Error('greeting a player does not pair with it');
						},
					};
				},
				seed: [],
			}),
		};
	}

	function answering<T>(json: T, status = 200): () => Promise<PlayerAnswer<T>> {
		return () => Promise.resolve({ headers: {}, json, status });
	}

	it('reports what the daemon calls itself', async () => {
		const { asked, store } = probing(answering(hello()));

		expect(await store.probe('192.168.1.42:45889')).toEqual({
			baseUrl: 'http://192.168.1.42:45889',
			id: '0123456789abcdef',
			name: 'Kitchen',
		});
		expect(asked).toEqual(['http://192.168.1.42:45889']);
	});

	it('refuses an address it cannot make sense of', async () => {
		const { asked, store } = probing(answering(hello()));

		await expect(store.probe('not an address')).rejects.toBe(PlayerErrors.INVALID_ADDRESS);
		expect(asked).toEqual([]);
	});

	it('reports a host that never answers as unreachable', async () => {
		const { store } = probing(() => Promise.reject(PlayerErrors.PLAYER_TIMED_OUT));

		await expect(store.probe('192.168.1.42:45889')).rejects.toBe(PlayerErrors.PLAYER_UNREACHABLE);
	});

	it('reports a refused connection as unreachable too', async () => {
		const { store } = probing(() => Promise.reject(new Error('connection refused')));

		await expect(store.probe('192.168.1.42:45889')).rejects.toBe(PlayerErrors.PLAYER_UNREACHABLE);
	});

	it('refuses a host that answers something other than a greeting', async () => {
		const { store } = probing(answering({ title: 'router admin' }));

		await expect(store.probe('192.168.1.42:45889')).rejects.toBe(PlayerErrors.NOT_AN_ATOLLA_PLAYER);
	});

	it('refuses a greeting that arrives with a failure status', async () => {
		const { store } = probing(answering(hello(), 404));

		await expect(store.probe('192.168.1.42:45889')).rejects.toBe(PlayerErrors.NOT_AN_ATOLLA_PLAYER);
	});

	it('adds nothing to the list, since probing is not pairing', async () => {
		const { store } = probing(answering(hello()));
		let notifications = 0;
		store.subscribe(() => {
			notifications += 1;
		});

		await store.probe('192.168.1.42:45889');

		expect(ids(store)).toEqual(['this-device']);
		expect(notifications).toBe(0);
	});
});

describe('PlayersStore', () => {
	it('flips a player enabled and tells subscribers', () => {
		const store = new PlayersStore({ seed: [makePlayer('a', { enabled: false })] });
		let notifications = 0;
		store.subscribe(() => {
			notifications += 1;
		});

		store.setEnabled('a', true);

		expect(store.sections()[0].players[0].enabled).toBe(true);
		expect(notifications).toBe(1);
	});

	it('ignores setEnabled for an id it does not hold', () => {
		const store = new PlayersStore({ seed: [makePlayer('a')] });
		let notifications = 0;
		store.subscribe(() => {
			notifications += 1;
		});

		store.setEnabled('nope', false);

		expect(notifications).toBe(0);
	});

	it('stops telling a subscriber once it unsubscribes', () => {
		const store = new PlayersStore({ seed: [makePlayer('a', { enabled: false })] });
		let notifications = 0;
		const unsubscribe = store.subscribe(() => {
			notifications += 1;
		});

		unsubscribe();
		store.setEnabled('a', true);

		expect(notifications).toBe(0);
	});

	it('forgets a player and tells subscribers', () => {
		const store = new PlayersStore({ seed: [makePlayer('a'), makePlayer('b')] });
		let notifications = 0;
		store.subscribe(() => {
			notifications += 1;
		});

		store.forget('a');

		expect(ids(store)).toEqual(['this-device', 'b']);
		expect(notifications).toBe(1);
	});

	it('refuses to forget this device', () => {
		const store = new PlayersStore({ seed: [makePlayer('a')] });

		store.forget('this-device');

		expect(ids(store)).toEqual(['this-device', 'a']);
	});
});

describe('PlayersStore reorder', () => {
	it('moves a player up the list and tells subscribers', () => {
		const store = new PlayersStore({
			seed: [makePlayer('a'), makePlayer('b'), makePlayer('c')],
		});
		let notifications = 0;
		store.subscribe(() => {
			notifications += 1;
		});

		store.reorder(3, 1);

		expect(ids(store)).toEqual(['this-device', 'c', 'a', 'b']);
		expect(notifications).toBe(1);
	});

	it('moves a player down the list', () => {
		const store = new PlayersStore({
			seed: [makePlayer('a'), makePlayer('b'), makePlayer('c')],
		});

		store.reorder(1, 3);

		expect(ids(store)).toEqual(['this-device', 'b', 'c', 'a']);
	});

	it('reorders against the current order, not the seed order', () => {
		const store = new PlayersStore({
			seed: [makePlayer('a'), makePlayer('b'), makePlayer('c')],
		});

		store.reorder(3, 1);
		store.reorder(2, 3);

		expect(ids(store)).toEqual(['this-device', 'c', 'b', 'a']);
	});

	it('refuses to move this device off the top', () => {
		const store = new PlayersStore({ seed: [makePlayer('a'), makePlayer('b')] });
		let notifications = 0;
		store.subscribe(() => {
			notifications += 1;
		});

		store.reorder(0, 2);

		expect(ids(store)).toEqual(['this-device', 'a', 'b']);
		expect(notifications).toBe(0);
	});

	it('does nothing when the indices match', () => {
		const store = new PlayersStore({ seed: [makePlayer('a'), makePlayer('b')] });
		let notifications = 0;
		store.subscribe(() => {
			notifications += 1;
		});

		store.reorder(2, 2);

		expect(ids(store)).toEqual(['this-device', 'a', 'b']);
		expect(notifications).toBe(0);
	});

	it.each([
		['a source past the end', 5, 1],
		['a negative source', -1, 1],
		['a destination past the end', 1, 5],
		['a negative destination', 2, -1],
	])('does nothing for %s', (_label, fromIndex, toIndex) => {
		const store = new PlayersStore({ seed: [makePlayer('a'), makePlayer('b')] });
		let notifications = 0;
		store.subscribe(() => {
			notifications += 1;
		});

		store.reorder(fromIndex, toIndex);

		expect(ids(store)).toEqual(['this-device', 'a', 'b']);
		expect(notifications).toBe(0);
	});
});

describe('PlayersStore persisted order', () => {
	it('restores a saved order on reload', async () => {
		const keyValueStore = new InMemoryKeyValueStore();
		const seed = [makePlayer('a'), makePlayer('b'), makePlayer('c')];
		new PlayersStore({ seed, store: keyValueStore }).reorder(3, 1);

		const reloaded = new PlayersStore({ seed, store: keyValueStore });
		await reloaded.ensureLoaded();

		expect(ids(reloaded)).toEqual(['this-device', 'c', 'a', 'b']);
	});

	it('keeps the seed order when nothing was ever saved', async () => {
		const store = new PlayersStore({ seed: [makePlayer('a'), makePlayer('b')] });

		await store.ensureLoaded();

		expect(ids(store)).toEqual(['this-device', 'a', 'b']);
	});

	it('keeps the seed order when the saved blob is unreadable', async () => {
		const keyValueStore = new InMemoryKeyValueStore();
		await keyValueStore.storeString(PLAYERS_ORDER_KEY, 'not json');

		const store = new PlayersStore({
			seed: [makePlayer('a'), makePlayer('b')],
			store: keyValueStore,
		});
		await store.ensureLoaded();

		expect(ids(store)).toEqual(['this-device', 'a', 'b']);
	});

	it('keeps the seed order when the saved blob is a version it does not know', async () => {
		const keyValueStore = new InMemoryKeyValueStore();
		await keyValueStore.storeString(
			PLAYERS_ORDER_KEY,
			JSON.stringify({ order: ['b', 'a'], version: 2 }),
		);

		const store = new PlayersStore({
			seed: [makePlayer('a'), makePlayer('b')],
			store: keyValueStore,
		});
		await store.ensureLoaded();

		expect(ids(store)).toEqual(['this-device', 'a', 'b']);
	});

	it('reads each saved blob only once', async () => {
		const keyValueStore = new InMemoryKeyValueStore();
		await keyValueStore.storeString(
			PLAYERS_ORDER_KEY,
			JSON.stringify({ order: ['b', 'a'], version: 1 }),
		);
		const reads: Array<string> = [];
		const counted = {
			fetchString: (key: string) => {
				reads.push(key);
				return keyValueStore.fetchString(key);
			},
			storeString: (key: string, value: string) => keyValueStore.storeString(key, value),
		};

		const store = new PlayersStore({
			seed: [makePlayer('a'), makePlayer('b')],
			store: counted,
		});
		await Promise.all([store.ensureLoaded(), store.ensureLoaded()]);
		await store.ensureLoaded();

		expect([...reads].sort()).toEqual([PLAYERS_KEY, PLAYERS_ORDER_KEY].sort());
	});

	it('tells subscribers once a saved order lands', async () => {
		const keyValueStore = new InMemoryKeyValueStore();
		await keyValueStore.storeString(
			PLAYERS_ORDER_KEY,
			JSON.stringify({ order: ['b', 'a'], version: 1 }),
		);
		const store = new PlayersStore({
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
			seed: [makePlayer('a'), makePlayer('b'), makePlayer('c')],
			store: keyValueStore,
		});

		const loading = store.ensureLoaded();
		store.reorder(1, 2);
		await loading;

		expect(ids(store)).toEqual(['this-device', 'b', 'a', 'c']);
	});

	it('keeps this device first even when the saved order names it last', async () => {
		const keyValueStore = new InMemoryKeyValueStore();
		await keyValueStore.storeString(
			PLAYERS_ORDER_KEY,
			JSON.stringify({ order: ['b', 'a', 'this-device'], version: 1 }),
		);

		const store = new PlayersStore({
			seed: [makePlayer('a'), makePlayer('b')],
			store: keyValueStore,
		});
		await store.ensureLoaded();

		expect(ids(store)).toEqual(['this-device', 'b', 'a']);
	});

	it('keeps this device first after another player is reordered', () => {
		const store = new PlayersStore({ seed: [makePlayer('a'), makePlayer('b')] });

		store.reorder(2, 1);

		expect(ids(store)).toEqual(['this-device', 'b', 'a']);
	});

	it('sorts a player the saved order has never seen to the bottom', async () => {
		const keyValueStore = new InMemoryKeyValueStore();
		await keyValueStore.storeString(
			PLAYERS_ORDER_KEY,
			JSON.stringify({ order: ['c', 'b'], version: 1 }),
		);

		const store = new PlayersStore({
			seed: [makePlayer('a'), makePlayer('b'), makePlayer('c')],
			store: keyValueStore,
		});
		await store.ensureLoaded();

		expect(ids(store)).toEqual(['this-device', 'c', 'b', 'a']);
	});

	it('puts a newly paired player at the bottom of a saved order', async () => {
		const keyValueStore = new InMemoryKeyValueStore();
		const store = new PlayersStore({
			createClient: () => ({
				hello: () => {
					throw new Error('pairing does not greet the player again');
				},
				pair: () =>
					Promise.resolve({
						headers: {},
						json: { token: 'a'.repeat(64) },
						status: 200,
					}) as ReturnType<PlayerClientPort['pair']>,
			}),
			seed: [makePlayer('a'), makePlayer('b')],
			store: keyValueStore,
		});
		store.reorder(2, 1);

		const paired = await store.pair(
			{ baseUrl: 'http://192.168.1.99:45889', id: 'new', name: 'New' },
			'12345678',
		);

		expect(ids(store)).toEqual(['this-device', 'b', 'a', paired.id]);
	});

	it('drops a forgotten player from the order on the next write', async () => {
		const keyValueStore = new InMemoryKeyValueStore();
		const store = new PlayersStore({
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
		baseUrl: 'http://192.168.1.42:45889',
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
