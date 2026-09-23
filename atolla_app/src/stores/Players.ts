import {
	DEFAULT_PLAYER_GROUP,
	type Player,
	type PlayerSection,
	PlayerStates,
	PlayerTiers,
} from '../models/Player';
import { PlayerErrors } from '../services/PlayerErrors';
import { MOCK_PLAYERS } from './playersMockData';

export const REFUSED_PAIRING_CODE = '00000000';

const PAIR_DELAY_MS = 900;
const PAIRED_PLAYER_NAMES = ['Bedroom', 'Dining Room', 'Studio', 'Conservatory'];

export class PlayersStore {
	private pairedCount = 0;
	private players: Array<Player>;
	private readonly subscribers = new Set<() => void>();

	constructor(
		seed: Array<Player> = MOCK_PLAYERS,
		private readonly pairDelayMs: number = PAIR_DELAY_MS,
	) {
		this.players = [...seed];
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

	forget(id: string): void {
		const player = this.players.find((candidate) => candidate.id === id);
		if (!player || player.isThisDevice) {
			return;
		}

		this.players = this.players.filter((candidate) => candidate.id !== id);
		this.notify();
	}

	sections(): Array<PlayerSection> {
		const sections: Array<PlayerSection> = [];
		for (const player of this.players) {
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

	private notify(): void {
		for (const callback of [...this.subscribers]) {
			callback();
		}
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
}
