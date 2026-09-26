import { describe, expect, it } from 'bun:test';
import { InMemoryKeyValueStore, type KeyValueStore } from 'atolla_core/src/stores/KeyValueStore';
import type {
	Hello,
	MediaServer,
	PairAccepted,
	PairRequest,
	Problem,
} from 'atolla_sync/src/api/generated';
import type { PlayerAnswer } from 'atolla_sync/src/api/PlayerClient';
import {
	DEFAULT_PLAYER_GROUP,
	type Player,
	PlayerStates,
	PlayerTiers,
	type ProbedPlayer,
} from '../models/Player';
import type { NetworkTransport } from '../services/NetworkStatus';
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
					mediaServer: () => {
						throw new Error('pairing does not provision the player');
					},
					pair: (body: PairRequest) => {
						sent.push(body);
						return answer() as ReturnType<PlayerClientPort['pair']>;
					},
					state: () => {
						throw new Error('pairing does not read the player state');
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
	function probing(answer: () => Promise<PlayerAnswer<unknown>>) {
		const asked: Array<string> = [];

		return {
			asked,
			store: new PlayersStore({
				createClient: (baseUrl: string) => {
					asked.push(baseUrl);
					return {
						hello: () => answer() as ReturnType<PlayerClientPort['hello']>,
						mediaServer: () => {
							throw new Error('greeting a player does not provision it');
						},
						pair: () => {
							throw new Error('greeting a player does not pair with it');
						},
						state: () => {
							throw new Error('greeting a player does not read its state');
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
				mediaServer: () => {
					throw new Error('pairing does not provision the player');
				},
				pair: () =>
					Promise.resolve({
						headers: {},
						json: { token: 'a'.repeat(64) },
						status: 200,
					}) as ReturnType<PlayerClientPort['pair']>,
				state: () => {
					throw new Error('pairing does not read the player state');
				},
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

describe('PlayersStore provision', () => {
	const KITCHEN: ProbedPlayer = {
		baseUrl: 'http://192.168.1.42:45889',
		id: '0123456789abcdef',
		name: 'Kitchen',
	};

	const CREDENTIAL: MediaServer = {
		accessToken: 'kitchen-token',
		baseUrl: 'https://demo.jellyfin.local',
		deviceId: 'atolla-0123456789abcdef-user-1',
		serverId: 'server-1',
		userId: 'user-1',
	};

	interface Options {
		greeting?: () => Promise<PlayerAnswer<unknown>>;
		held?: Array<string>;
		mint?: () => Promise<MediaServer>;
		networkTransport?: NetworkTransport;
		push?: PlayerAnswer<unknown>;
		state?: () => Promise<PlayerAnswer<unknown>>;
		userId?: string;
		withoutProvisioning?: boolean;
	}

	function answer(json: unknown, status = 200): PlayerAnswer<unknown> {
		return { headers: {}, json, status };
	}

	function provisioning(options: Options = {}) {
		const greetings: Array<string> = [];
		const mints: Array<Player> = [];
		const pushes: Array<{ body: MediaServer; token: string }> = [];
		const reads: Array<string> = [];

		const store = new PlayersStore({
			controllerId: () => 'atolla-phone-1',
			createClient: (baseUrl: string) => ({
				hello: () => {
					greetings.push(baseUrl);
					return (options.greeting?.() ?? Promise.resolve(answer(hello()))) as ReturnType<
						PlayerClientPort['hello']
					>;
				},
				mediaServer: (token: string, body: MediaServer) => {
					pushes.push({ body, token });
					return Promise.resolve(options.push ?? answer({ version: 2 })) as ReturnType<
						PlayerClientPort['mediaServer']
					>;
				},
				pair: () =>
					Promise.resolve(answer({ token: 'a'.repeat(64) })) as ReturnType<
						PlayerClientPort['pair']
					>,
				state: (token: string) => {
					reads.push(token);
					return (options.state?.() ??
						Promise.resolve(
							answer({ sourceHealth: { mediaServerUsers: options.held ?? [] } }),
						)) as ReturnType<PlayerClientPort['state']>;
				},
			}),
			deviceName: () => 'Pixel 9 Pro',
			networkTransport: () => options.networkTransport ?? 'none',
			provisioning: options.withoutProvisioning
				? undefined
				: {
						mint: (player: Player) => {
							mints.push(player);
							return options.mint?.() ?? Promise.resolve(CREDENTIAL);
						},
						userId: () => options.userId ?? 'user-1',
					},
		});

		return { greetings, mints, pushes, reads, store };
	}

	async function paired(options: Options = {}) {
		const harness = provisioning(options);
		await harness.store.pair(KITCHEN, '12345678');

		return harness;
	}

	it('gives the player a credential when its account is missing', async () => {
		const { pushes, store } = await paired({ held: [] });

		await store.provision(KITCHEN.id);

		expect(pushes).toEqual([{ body: CREDENTIAL, token: 'a'.repeat(64) }]);
	});

	it('mints nothing when the player already holds that account', async () => {
		const { mints, pushes, store } = await paired({ held: ['user-1'] });

		await store.provision(KITCHEN.id);

		expect(mints).toEqual([]);
		expect(pushes).toEqual([]);
	});

	it('pushes alongside another household member', async () => {
		const { pushes, store } = await paired({ held: ['user-2'] });

		await store.provision(KITCHEN.id);

		expect(pushes.length).toBe(1);
	});

	it('leaves a player that has not said what it holds alone', async () => {
		const { pushes, store } = await paired({ state: () => Promise.resolve(answer({})) });

		await store.provision(KITCHEN.id);

		expect(pushes).toEqual([]);
	});

	it('surfaces the refusal when the player serves another media server', async () => {
		const { store } = await paired({
			push: answer({ code: 'media_server_id_mismatch', status: 409, title: 'x' }, 409),
		});

		await expect(store.provision(KITCHEN.id)).rejects.toHaveProperty(
			'err',
			'media_server_id_mismatch',
		);
	});

	it('surfaces a pairing token the player no longer honours', async () => {
		const { store } = await paired({
			state: () => Promise.resolve(answer({ code: 'invalid_token', status: 401, title: 'x' }, 401)),
		});

		await expect(store.provision(KITCHEN.id)).rejects.toHaveProperty('err', 'invalid_token');
	});

	it('reports a player that never answers as unreachable', async () => {
		const { store } = await paired({ state: () => Promise.reject(new Error('no route')) });

		await expect(store.provision(KITCHEN.id)).rejects.toHaveProperty(
			'err',
			PlayerErrors.PLAYER_UNREACHABLE.err,
		);
	});

	it('does nothing while nobody is signed in', async () => {
		const { mints, pushes, store } = await paired({ held: [], userId: '' });

		await store.provision(KITCHEN.id);

		expect(mints).toEqual([]);
		expect(pushes).toEqual([]);
	});

	it('does nothing when the store was built without provisioning', async () => {
		const { pushes, store } = await paired({ held: [], withoutProvisioning: true });

		await store.provision(KITCHEN.id);

		expect(pushes).toEqual([]);
	});

	it('does nothing for a player it has never paired with', async () => {
		const { pushes, store } = provisioning({ held: [] });

		await store.provision('unknown');

		expect(pushes).toEqual([]);
	});

	it('sends nothing to a player that is not the one we paired with', async () => {
		const { mints, pushes, reads, store } = await paired({
			greeting: () => Promise.resolve(answer(hello({ id: 'ffffffffffffffff' }))),
		});

		await expect(store.provision(KITCHEN.id)).rejects.toHaveProperty(
			'err',
			PlayerErrors.NOT_THE_PAIRED_PLAYER.err,
		);
		expect(reads).toEqual([]);
		expect(mints).toEqual([]);
		expect(pushes).toEqual([]);
	});

	it('greets a player before it sends the pairing token', async () => {
		const { greetings, reads, store } = await paired({ held: [] });

		await store.provision(KITCHEN.id);

		expect(greetings).toEqual([KITCHEN.baseUrl]);
		expect(reads).toEqual(['a'.repeat(64)]);
	});

	it('reports a player whose greeting never answers as unreachable', async () => {
		const { reads, store } = await paired({
			greeting: () => Promise.reject(new Error('no route')),
		});

		await expect(store.provision(KITCHEN.id)).rejects.toHaveProperty(
			'err',
			PlayerErrors.PLAYER_UNREACHABLE.err,
		);
		expect(reads).toEqual([]);
	});

	it('does not reach for a player on mobile data', async () => {
		const { greetings, pushes, store } = await paired({ held: [], networkTransport: 'cellular' });

		await store.provision(KITCHEN.id);

		expect(greetings).toEqual([]);
		expect(pushes).toEqual([]);
	});

	it('provisions over wifi', async () => {
		const { pushes, store } = await paired({ held: [], networkTransport: 'wifi' });

		await store.provision(KITCHEN.id);

		expect(pushes.length).toBe(1);
	});

	it('provisions when nothing reports a transport at all', async () => {
		const { pushes, store } = await paired({ held: [], networkTransport: 'none' });

		await store.provision(KITCHEN.id);

		expect(pushes.length).toBe(1);
	});
});

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
