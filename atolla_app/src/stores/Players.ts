import { InMemoryKeyValueStore, type KeyValueStore } from 'atolla_core/src/stores/KeyValueStore';
import type { Hello } from 'atolla_sync/src/api/generated';
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
import { MOCK_PLAYERS } from './playersMockData';

export const PLAYERS_ORDER_KEY = 'players_order';
export const REFUSED_PAIRING_CODE = '00000000';

const PAIR_DELAY_MS = 900;
const PAIRED_PLAYER_NAMES = ['Bedroom', 'Dining Room', 'Studio', 'Conservatory'];

interface PersistedPlayerOrder {
	order: Array<string>;
	version: 1;
}

export type CreatePlayerClient = (baseUrl: string) => PlayerClient;

export interface PlayersStoreOptions {
	createClient?: CreatePlayerClient;
	pairDelayMs?: number;
	seed?: Array<Player>;
	store?: KeyValueStore;
}

function isPersistedPlayerOrder(value: unknown): value is PersistedPlayerOrder {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<PersistedPlayerOrder>;
	return candidate.version === 1 && Array.isArray(candidate.order);
}

export class PlayersStore {
	private isLoaded = false;
	private loadPromise: Promise<void> | null = null;
	private order: Array<string> = [];
	private pairedCount = 0;
	private readonly createClient: CreatePlayerClient | undefined;
	private readonly pairDelayMs: number;
	private players: Array<Player>;
	private readonly store: KeyValueStore;
	private readonly subscribers = new Set<() => void>();

	constructor(options: PlayersStoreOptions = {}) {
		this.createClient = options.createClient;
		this.pairDelayMs = options.pairDelayMs ?? PAIR_DELAY_MS;
		this.players = [...(options.seed ?? MOCK_PLAYERS)];
		this.store = options.store ?? new InMemoryKeyValueStore();
	}

	add(code: string): Promise<Player> {
		return new Promise((resolve, reject) => {
			setTimeout(() => {
				if (code === REFUSED_PAIRING_CODE) {
					reject(PlayerErrors.INVALID_PAIRING_CODE);
					return;
				}

				const player = this.pairedPlayer();
				this.players = [...this.players, player];
				this.notify();
				resolve(player);
			}, this.pairDelayMs);
		});
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
		const player = this.players.find((candidate) => candidate.id === id);
		if (!player || player.isThisDevice) {
			return;
		}

		this.players = this.players.filter((candidate) => candidate.id !== id);
		this.notify();
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
		if (!moved || fromIndex === toIndex || toIndex < 0 || toIndex >= ordered.length) {
			return;
		}

		ordered.splice(fromIndex, 1);
		ordered.splice(toIndex, 0, moved);
		this.order = ordered.map((player) => player.id);
		this.notify();
		void this.persist();
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
		if (!this.players.some((player) => player.id === id)) {
			return;
		}

		this.players = this.players.map((player) =>
			player.id === id ? { ...player, enabled } : player,
		);
		this.notify();
	}

	subscribe(callback: () => void): () => void {
		this.subscribers.add(callback);
		return () => {
			this.subscribers.delete(callback);
		};
	}

	private async load(): Promise<void> {
		let loaded: Array<string> = [];
		try {
			const parsed = JSON.parse(await this.store.fetchString(PLAYERS_ORDER_KEY)) as unknown;
			loaded = isPersistedPlayerOrder(parsed) ? parsed.order : [];
		} catch {
			loaded = [];
		}

		this.isLoaded = true;
		if (loaded.length === 0 || this.order.length > 0) {
			return;
		}

		this.order = loaded;
		this.notify();
	}

	private notify(): void {
		for (const callback of [...this.subscribers]) {
			callback();
		}
	}

	private orderedPlayers(): Array<Player> {
		const rank = new Map(this.order.map((id, index) => [id, index]));
		const last = this.order.length;
		const rankOf = (player: Player): number =>
			player.isThisDevice ? -1 : (rank.get(player.id) ?? last);
		return [...this.players].sort((a, b) => rankOf(a) - rankOf(b));
	}

	private pairedPlayer(): Player {
		const index = this.pairedCount;
		this.pairedCount += 1;

		return {
			address: `192.168.1.${50 + index}`,
			enabled: false,
			group: DEFAULT_PLAYER_GROUP,
			icon: null,
			id: `paired-${index}`,
			isThisDevice: false,
			lastError: null,
			name: PAIRED_PLAYER_NAMES[index] ?? `Speaker ${index + 1}`,
			reachable: true,
			state: PlayerStates.idle,
			tier: PlayerTiers.tight,
		};
	}

	private persist(): Promise<void> {
		const blob: PersistedPlayerOrder = { order: this.order, version: 1 };
		return this.store.storeString(PLAYERS_ORDER_KEY, JSON.stringify(blob)).catch(() => {});
	}
}
