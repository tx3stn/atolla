import { getLogger } from 'atolla_core/src/services/Logger';
import type { MediaServer } from 'atolla_sync/src/api/generated';
import type { Answer } from '../Http';
import { type MediaServerCredentials, PushOutcomes } from '../MediaServerCredentials';
import type { StateVersion } from '../StateVersion';

export interface MediaServerDeps {
	credentials: MediaServerCredentials;
	version: StateVersion;
}

const ID_MISMATCH = 409;

const log = getLogger('media-server');

export function handleMediaServer(deps: MediaServerDeps, body: string): Promise<Answer> {
	const credential = JSON.parse(body) as MediaServer;
	const outcome = deps.credentials.push(credential);

	// Who it is for, never what it is.
	log.info('pushed', { outcome, userId: credential.userId });

	if (outcome === PushOutcomes.idMismatch) {
		return Promise.resolve({ body: '', status: ID_MISMATCH });
	}

	return Promise.resolve({
		body: JSON.stringify({ version: deps.version.current }),
		status: 200,
	});
}
