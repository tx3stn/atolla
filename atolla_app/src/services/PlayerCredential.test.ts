import { describe, expect, it } from 'bun:test';
import type { AuthSession } from 'atolla_core/src/models/Auth';
import type { ClientIdentity } from 'atolla_jellyfin/src/ClientIdentity';
import type { DeviceToken } from 'atolla_jellyfin/src/services/JellyfinAuthService';
import { DEFAULT_PLAYER_GROUP, type Player, PlayerStates, PlayerTiers } from '../models/Player';
import { type DeviceTokenMinter, mintPlayerCredential } from './PlayerCredential';

const kitchen: Player = {
	baseUrl: 'http://192.168.1.42:45889',
	clock: { synced: true },
	enabled: true,
	group: DEFAULT_PLAYER_GROUP,
	icon: null,
	id: '0123456789abcdef',
	isThisDevice: false,
	lastError: null,
	name: 'Kitchen',
	reachable: true,
	state: PlayerStates.idle,
	tier: PlayerTiers.tight,
};

const session: AuthSession = {
	accessToken: 'phone-token',
	serverId: '',
	serverName: 'Demo Server',
	serverUrl: 'https://demo.jellyfin.local',
	userId: 'user-1',
};

function minter(token: Partial<DeviceToken> = {}) {
	const identities: Array<ClientIdentity> = [];
	const port: DeviceTokenMinter = {
		mintDeviceToken: (identity) => {
			identities.push(identity);

			return Promise.resolve({
				accessToken: 'kitchen-token',
				serverId: 'server-1',
				userId: 'user-1',
				...token,
			});
		},
	};

	return { identities, port };
}

describe('mintPlayerCredential', () => {
	it('mints under a device id carrying both the player and the account', async () => {
		const { identities, port } = minter();

		await mintPlayerCredential(port, kitchen, session);

		expect(identities[0].deviceId).toBe('atolla-0123456789abcdef-user-1');
	});

	it('mints as the headless client, named after the room', async () => {
		const { identities, port } = minter();

		await mintPlayerCredential(port, kitchen, session);

		expect(identities[0].client).toBe('atolla-headless');
		expect(identities[0].deviceName).toBe('Kitchen');
	});

	it('names the same device id it minted against', async () => {
		const { port } = minter();

		const credential = await mintPlayerCredential(port, kitchen, session);

		expect(credential.deviceId).toBe('atolla-0123456789abcdef-user-1');
	});

	it('takes the server id from the minted token rather than the session', async () => {
		const { port } = minter();

		const credential = await mintPlayerCredential(port, kitchen, session);

		expect(credential.serverId).toBe('server-1');
	});

	it('points the player at the server this controller reaches', async () => {
		const { port } = minter();

		const credential = await mintPlayerCredential(port, kitchen, session);

		expect(credential.baseUrl).toBe('https://demo.jellyfin.local');
		expect(credential.accessToken).toBe('kitchen-token');
		expect(credential.userId).toBe('user-1');
	});
});
