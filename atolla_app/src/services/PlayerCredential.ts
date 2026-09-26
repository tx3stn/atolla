import type { AuthSession } from 'atolla_core/src/models/Auth';
import { CLIENT_HEADLESS } from 'atolla_jellyfin/src/ClientIdentity';
import type { JellyfinAuthService } from 'atolla_jellyfin/src/services/JellyfinAuthService';
import type { MediaServer } from 'atolla_sync/src/api/generated';
import type { Player } from '../models/Player';

export type DeviceTokenMinter = Pick<JellyfinAuthService, 'mintDeviceToken'>;

export async function mintPlayerCredential(
	minter: DeviceTokenMinter,
	player: Player,
	session: AuthSession,
): Promise<MediaServer> {
	const deviceId = `atolla-${player.id}-${session.userId}`;

	const minted = await minter.mintDeviceToken(
		{ client: CLIENT_HEADLESS, deviceId, deviceName: player.name },
		session,
	);

	return {
		accessToken: minted.accessToken,
		baseUrl: session.serverUrl,
		deviceId,
		serverId: minted.serverId,
		userId: minted.userId,
	};
}
