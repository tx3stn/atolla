import { getLogger } from 'atolla_core/src/services/Logger';
import type { KeyValueStore } from 'atolla_core/src/stores/KeyValueStore';
import type { PairRequest } from 'atolla_sync/src/api/generated';
import type { Answer } from '../Http';
import type { MediaServerCredentials } from '../MediaServerCredentials';
import { addController } from '../Pairing';
import type { RandomBytes } from '../Random';

export interface PairDeps {
	credentials: MediaServerCredentials;
	randomBytes: RandomBytes;
	secrets: KeyValueStore;
}

const log = getLogger('pair');

export async function handlePair(deps: PairDeps, body: string): Promise<Answer> {
	const request = JSON.parse(body) as PairRequest;

	const token = await addController(deps.secrets, deps.randomBytes, {
		controllerId: request.controllerId,
		controllerName: request.controllerName,
	});

	if (request.mediaServer !== undefined) {
		deps.credentials.push(request.mediaServer);
	}

	log.info('paired', {
		controllerId: request.controllerId,
		mediaServer: request.mediaServer !== undefined,
	});

	return { body: JSON.stringify({ token }), status: 200 };
}
