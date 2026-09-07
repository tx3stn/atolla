import { getLogger } from 'atolla_core/src/services/Logger';
import type { KeyValueStore } from 'atolla_core/src/stores/KeyValueStore';
import type { Answer } from '../Http';
import { addController, MEDIA_SERVER_KEY, type MediaServerCredentials } from '../Pairing';
import type { RandomBytes } from '../Random';

export interface PairDeps {
	randomBytes: RandomBytes;
	secrets: KeyValueStore;
}

interface PairRequest {
	controllerId: string;
	controllerName: string;
	mediaServer?: MediaServerCredentials;
}

const log = getLogger('pair');

export async function handlePair(deps: PairDeps, body: string): Promise<Answer> {
	const request = JSON.parse(body) as PairRequest;

	const token = await addController(deps.secrets, deps.randomBytes, {
		controllerId: request.controllerId,
		controllerName: request.controllerName,
	});

	if (request.mediaServer !== undefined) {
		await deps.secrets.storeString(MEDIA_SERVER_KEY, JSON.stringify(request.mediaServer));
	}

	log.info('paired', {
		controllerId: request.controllerId,
		mediaServer: request.mediaServer !== undefined,
	});

	return { body: JSON.stringify({ token }), status: 200 };
}
