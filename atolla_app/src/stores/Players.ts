import { InMemoryKeyValueStore, type KeyValueStore } from 'atolla_core/src/stores/KeyValueStore';
import { InternalError } from 'atolla_core/src/utils/Errors';
import type {
	Hello,
	MediaServer,
	PairAccepted,
	Problem,
	StateSnapshot,
} from 'atolla_sync/src/api/generated';
import type { PlayerClient } from 'atolla_sync/src/api/PlayerClient';
import {
	DEFAULT_PLAYER_GROUP,
	type Player,
	type PlayerSection,
	PlayerStates,
	PlayerTiers,
	type ProbedPlayer,
} from '../models/Player';
import { normalizeAddress } from '../services/PlayerAddress';
import { PlayerErrors } from '../services/PlayerErrors';

export const PLAYERS_KEY = 'players';
export const PLAYERS_ORDER_KEY = 'players_order';
export const THIS_DEVICE_ID = 'this-device';

interface PersistedPlayer {
	baseUrl: string;
	enabled: boolean;
	icon: string | null;
	id: string;
	name: string;
	token: string;
}

interface PersistedPlayers {
	players: Array<PersistedPlayer>;
	thisDeviceEnabled: boolean;
	version: 1;
}

interface PersistedPlayerOrder {
	order: Array<string>;
	version: 1;
}

export type PlayerClientPort = Pick<PlayerClient, 'hello' | 'mediaServer' | 'pair' | 'state'>;

export type CreatePlayerClient = (baseUrl: string) => PlayerClientPort;

export interface MediaServerProvisioning {
	mint: (player: Player) => Promise<MediaServer>;
	userId: () => string;
}

export interface PlayersStoreOptions {
	controllerId?: () => string;
	createClient?: CreatePlayerClient;
	deviceName?: () => string;
	provisioning?: MediaServerProvisioning;
	seed?: Array<Player>;
	store?: KeyValueStore;
}

function isPersistedPlayerOrder(value: unknown): value is PersistedPlayerOrder {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<PersistedPlayerOrder>;
	return candidate.version === 1 && Array.isArray(candidate.order);
}

function isPersistedPlayers(value: unknown): value is PersistedPlayers {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<PersistedPlayers>;
	return candidate.version === 1 && Array.isArray(candidate.players);
}

function refusal(problem: Partial<Problem>): InternalError<string> {
	const code = typeof problem.code === 'string' ? problem.code : 'internal';
	const seconds = problem.retryAfterSeconds;

	return seconds === undefined
		? new InternalError(code)
		: new InternalError(code).withDetail(String(seconds));
}

export class PlayersStore {
	private isLoaded = false;
	private loadPromise: Promise<void> | null = null;
	private order: Array<string> = [];
	private players: Array<Player>;
	private thisDeviceEnabled = true;
	private readonly controllerId: () => string;
	private readonly createClient: CreatePlayerClient | undefined;
	private readonly deviceName: () => string;
	private readonly provisioning: MediaServerProvisioning | undefined;
	private readonly store: KeyValueStore;
	private readonly subscribers = new Set<() => void>();
	private readonly tokens = new Map<string, string>();

	constructor(options: PlayersStoreOptions = {}) {
		this.controllerId = options.controllerId ?? (() => 'atolla');
		this.createClient = options.createClient;
		this.deviceName = options.deviceName ?? (() => '');
		this.players = [...(options.seed ?? [])];
		this.provisioning = options.provisioning;
		this.store = options.store ?? new InMemoryKeyValueStore();
	}

	ensureLoaded(): Promise<void> {
		if (this.isLoaded) {
			return Promise.resolve();
		}
		if (!this.loadPromise) {
			this.loadPromise = this.load();
		}
		return this.loadPromise;
	}

	forget(id: string): void {
		if (!this.players.some((candidate) => candidate.id === id)) {
			return;
		}

		this.players = this.players.filter((candidate) => candidate.id !== id);
		this.tokens.delete(id);
		this.notify();
		void this.persist();
	}

	pair(player: ProbedPlayer, code: string): Promise<Player> {
		const createClient = this.createClient;
		if (createClient === undefined) {
			return Promise.reject(new Error('players store was built without a client factory'));
		}

		const body = {
			code,
			controllerId: this.controllerId(),
			controllerName: this.deviceName(),
		};

		return Promise.resolve(createClient(player.baseUrl).pair(body)).then(
			(answer) => {
				if (answer.status !== 200) {
					throw refusal(answer.json as Partial<Problem>);
				}

				const { token } = answer.json as Partial<PairAccepted>;
				if (typeof token !== 'string') {
					throw PlayerErrors.NOT_AN_ATOLLA_PLAYER;
				}

				return this.remember(player, token);
			},
			() => {
				throw PlayerErrors.PLAYER_UNREACHABLE;
			},
		);
	}

	async provision(id: string): Promise<void> {
		const provisioning = this.provisioning;
		const createClient = this.createClient;
		const player = this.players.find((candidate) => candidate.id === id);
		const token = this.tokens.get(id);
		if (
			provisioning === undefined ||
			createClient === undefined ||
			player === undefined ||
			player.baseUrl === null ||
			token === undefined
		) {
			return;
		}

		const userId = provisioning.userId();
		if (userId === '') {
			return;
		}

		const client = createClient(player.baseUrl);

		const snapshot = await Promise.resolve(client.state(token)).catch(() => {
			throw PlayerErrors.PLAYER_UNREACHABLE;
		});
		if (snapshot.status !== 200) {
			throw refusal(snapshot.json as Partial<Problem>);
		}

		const held = (snapshot.json as Partial<StateSnapshot>).sourceHealth?.mediaServerUsers;
		if (held === undefined || held.includes(userId)) {
			return;
		}

		const credential = await provisioning.mint(player);
		const pushed = await Promise.resolve(client.mediaServer(token, credential)).catch(() => {
			throw PlayerErrors.PLAYER_UNREACHABLE;
		});
		if (pushed.status !== 200) {
			throw refusal(pushed.json as Partial<Problem>);
		}
	}

	probe(address: string): Promise<ProbedPlayer> {
		const baseUrl = normalizeAddress(address);
		if (baseUrl === null) {
			return Promise.reject(PlayerErrors.INVALID_ADDRESS);
		}

		const createClient = this.createClient;
		if (createClient === undefined) {
			return Promise.reject(new Error('players store was built without a client factory'));
		}

		return Promise.resolve(createClient(baseUrl).hello()).then(
			(answer) => {
				const { id, name } = answer.json as Partial<Hello>;
				if (answer.status !== 200 || typeof id !== 'string' || typeof name !== 'string') {
					throw PlayerErrors.NOT_AN_ATOLLA_PLAYER;
				}

				return { baseUrl, id, name };
			},
			() => {
				throw PlayerErrors.PLAYER_UNREACHABLE;
			},
		);
	}

	reorder(fromIndex: number, toIndex: number): void {
		const ordered = this.orderedPlayers();
		const moved = ordered[fromIndex];
		if (
			!moved ||
			moved.isThisDevice ||
			fromIndex === toIndex ||
			toIndex < 0 ||
			toIndex >= ordered.length
		) {
			return;
		}

		ordered.splice(fromIndex, 1);
		ordered.splice(toIndex, 0, moved);
		this.order = ordered.filter((player) => !player.isThisDevice).map((player) => player.id);
		this.notify();
		void this.persistOrder();
	}

	sections(): Array<PlayerSection> {
		const sections: Array<PlayerSection> = [];
		for (const player of this.orderedPlayers()) {
			const section = sections.find((candidate) => candidate.group === player.group);
			if (section) {
				section.players.push(player);
				continue;
			}
			sections.push({ group: player.group, players: [player] });
		}
		return sections;
	}

	setEnabled(id: string, enabled: boolean): void {
		if (id === THIS_DEVICE_ID) {
			this.thisDeviceEnabled = enabled;
			this.notify();
			void this.persist();
			return;
		}

		if (!this.players.some((player) => player.id === id)) {
			return;
		}

		this.players = this.players.map((player) =>
			player.id === id ? { ...player, enabled } : player,
		);
		this.notify();
		void this.persist();
	}

	subscribe(callback: () => void): () => void {
		this.subscribers.add(callback);
		return () => {
			this.subscribers.delete(callback);
		};
	}

	tokenFor(id: string): string | undefined {
		return this.tokens.get(id);
	}

	private async load(): Promise<void> {
		const [players, order] = await Promise.all([this.readPlayers(), this.readOrder()]);

		this.isLoaded = true;

		let changed = false;
		if (players !== null && this.players.length === 0) {
			this.players = players.players.map((stored) => this.restore(stored));
			this.thisDeviceEnabled = players.thisDeviceEnabled;
			for (const stored of players.players) {
				this.tokens.set(stored.id, stored.token);
			}
			changed = true;
		}

		if (order.length > 0 && this.order.length === 0) {
			this.order = order;
			changed = true;
		}

		if (changed) {
			this.notify();
		}
	}

	private notify(): void {
		for (const callback of [...this.subscribers]) {
			callback();
		}
	}

	private orderedPlayers(): Array<Player> {
		const rank = new Map(this.order.map((id, index) => [id, index]));
		const last = this.order.length;
		const rankOf = (player: Player): number => rank.get(player.id) ?? last;
		const paired = [...this.players].sort((a, b) => rankOf(a) - rankOf(b));

		return [this.thisDevice(), ...paired];
	}

	private persist(): Promise<void> {
		const blob: PersistedPlayers = {
			players: this.players.map((player) => ({
				baseUrl: player.baseUrl ?? '',
				enabled: player.enabled,
				icon: player.icon,
				id: player.id,
				name: player.name,
				token: this.tokens.get(player.id) ?? '',
			})),
			thisDeviceEnabled: this.thisDeviceEnabled,
			version: 1,
		};

		return this.store.storeString(PLAYERS_KEY, JSON.stringify(blob)).catch(() => {});
	}

	private persistOrder(): Promise<void> {
		const blob: PersistedPlayerOrder = { order: this.order, version: 1 };
		return this.store.storeString(PLAYERS_ORDER_KEY, JSON.stringify(blob)).catch(() => {});
	}

	private async readOrder(): Promise<Array<string>> {
		try {
			const parsed = JSON.parse(await this.store.fetchString(PLAYERS_ORDER_KEY)) as unknown;
			return isPersistedPlayerOrder(parsed) ? parsed.order : [];
		} catch {
			return [];
		}
	}

	private async readPlayers(): Promise<PersistedPlayers | null> {
		try {
			const parsed = JSON.parse(await this.store.fetchString(PLAYERS_KEY)) as unknown;
			return isPersistedPlayers(parsed) ? parsed : null;
		} catch {
			return null;
		}
	}

	private remember(probed: ProbedPlayer, token: string): Player {
		const player: Player = {
			baseUrl: probed.baseUrl,
			enabled: this.players.find((candidate) => candidate.id === probed.id)?.enabled ?? false,
			group: DEFAULT_PLAYER_GROUP,
			icon: null,
			id: probed.id,
			isThisDevice: false,
			lastError: null,
			name: probed.name,
			reachable: true,
			state: PlayerStates.idle,
			tier: PlayerTiers.tight,
		};

		this.players = [...this.players.filter((candidate) => candidate.id !== probed.id), player];
		this.tokens.set(probed.id, token);
		this.notify();
		void this.persist();

		return player;
	}

	private restore(stored: PersistedPlayer): Player {
		return {
			baseUrl: stored.baseUrl,
			enabled: stored.enabled,
			group: DEFAULT_PLAYER_GROUP,
			icon: stored.icon,
			id: stored.id,
			isThisDevice: false,
			lastError: null,
			name: stored.name,
			reachable: true,
			state: PlayerStates.idle,
			tier: PlayerTiers.tight,
		};
	}

	private thisDevice(): Player {
		return {
			baseUrl: null,
			enabled: this.thisDeviceEnabled,
			group: DEFAULT_PLAYER_GROUP,
			icon: null,
			id: THIS_DEVICE_ID,
			isThisDevice: true,
			lastError: null,
			name: this.deviceName(),
			reachable: true,
			state: PlayerStates.idle,
			tier: PlayerTiers.loose,
		};
	}
}
