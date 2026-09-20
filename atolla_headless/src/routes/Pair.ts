import { getLogger } from 'atolla_core/src/services/Logger';
import type { KeyValueStore } from 'atolla_core/src/stores/KeyValueStore';
import type { PairRequest } from 'atolla_sync/src/api/generated';
import type { Answer } from '../Http';
import type { MediaServerCredentials } from '../MediaServerCredentials';
import { type MediaServerTransports, VerifyOutcomes } from '../MediaServerTransports';
import { addController } from '../Pairing';
import type { RandomBytes } from '../Random';

export interface PairDeps {
	credentials: MediaServerCredentials;
	randomBytes: RandomBytes;
	secrets: KeyValueStore;
	transports: MediaServerTransports;
}

const log = getLogger('pair');

export async function handlePair(deps: PairDeps, body: string): Promise<Answer> {
	const request = JSON.parse(body) as PairRequest;

	// Verified like any other push, but an unreachable server never costs the controller its
	// pairing. It sees the missing id in `/state` and re-pushes through `PUT /media-server`, which
	// answers with a code.
	const verified =
		request.mediaServer === undefined ? null : await deps.transports.verify(request.mediaServer);

	const token = await addController(deps.secrets, deps.randomBytes, {
		controllerId: request.controllerId,
		controllerName: request.controllerName,
	});

	if (request.mediaServer !== undefined && verified === VerifyOutcomes.verified) {
		deps.credentials.push(request.mediaServer);
	}

	log.info('paired', {
		controllerId: request.controllerId,
		mediaServer: request.mediaServer !== undefined,
		verified,
	});

	return { body: JSON.stringify({ token }), status: 200 };
}
