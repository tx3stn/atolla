import { describe, expect, it } from 'bun:test';
import { DEFAULT_PLAYER_GROUP, type Player, PlayerStates, PlayerTiers } from '../models/Player';
import { PlayerErrors } from '../services/PlayerErrors';
import { PlayersStore, REFUSED_PAIRING_CODE } from './Players';

describe('PlayersStore', () => {
	it('flips a player enabled and tells subscribers', () => {
		const store = new PlayersStore([makePlayer('a', { enabled: false })], 0);
		let notifications = 0;
		store.subscribe(() => {
			notifications += 1;
		});

		store.setEnabled('a', true);

		expect(store.sections()[0].players[0].enabled).toBe(true);
		expect(notifications).toBe(1);
	});

	it('ignores setEnabled for an id it does not hold', () => {
		const store = new PlayersStore([makePlayer('a')], 0);
		let notifications = 0;
		store.subscribe(() => {
			notifications += 1;
		});

		store.setEnabled('nope', false);

		expect(notifications).toBe(0);
	});

	it('stops telling a subscriber once it unsubscribes', () => {
		const store = new PlayersStore([makePlayer('a', { enabled: false })], 0);
		let notifications = 0;
		const unsubscribe = store.subscribe(() => {
			notifications += 1;
		});

		unsubscribe();
		store.setEnabled('a', true);

		expect(notifications).toBe(0);
	});

	it('gives a paired player an id nothing else holds', async () => {
		const store = new PlayersStore([makePlayer('a')], 0);

		const first = await store.add('12345678');
		const second = await store.add('87654321');

		expect(second.id).not.toBe(first.id);
	});

	it('refuses the reserved code with an invalid pairing code error, adding nothing', async () => {
		const store = new PlayersStore([makePlayer('a')], 0);

		await expect(store.add(REFUSED_PAIRING_CODE)).rejects.toBe(PlayerErrors.INVALID_PAIRING_CODE);
		expect(store.sections()[0].players.map((player) => player.id)).toEqual(['a']);
	});

	it('forgets a player and tells subscribers', () => {
		const store = new PlayersStore([makePlayer('a'), makePlayer('b')], 0);
		let notifications = 0;
		store.subscribe(() => {
			notifications += 1;
		});

		store.forget('a');

		expect(store.sections()[0].players.map((player) => player.id)).toEqual(['b']);
		expect(notifications).toBe(1);
	});

	it('refuses to forget this device', () => {
		const store = new PlayersStore([makePlayer('a', { isThisDevice: true })], 0);

		store.forget('a');

		expect(store.sections()[0].players.map((player) => player.id)).toEqual(['a']);
	});
});

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
