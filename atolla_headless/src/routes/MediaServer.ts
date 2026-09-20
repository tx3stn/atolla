import { getLogger } from 'atolla_core/src/services/Logger';
import type { MediaServer } from 'atolla_sync/src/api/generated';
import type { Answer } from '../Http';
import { type MediaServerCredentials, PushOutcomes } from '../MediaServerCredentials';
import { type MediaServerTransports, VerifyOutcomes } from '../MediaServerTransports';
import type { StateVersion } from '../StateVersion';

export interface MediaServerDeps {
	credentials: MediaServerCredentials;
	transports: MediaServerTransports;
	version: StateVersion;
}

const ID_MISMATCH = 409;
const UNAVAILABLE = 503;
const USER_MISMATCH = 422;

const log = getLogger('media-server');

export async function handleMediaServer(deps: MediaServerDeps, body: string): Promise<Answer> {
	const credential = JSON.parse(body) as MediaServer;
	const verified = await deps.transports.verify(credential);

	// Who it is for, never what it is.
	log.info('pushed', { userId: credential.userId, verified });

	if (verified === VerifyOutcomes.mismatch) {
		return { body: '', status: USER_MISMATCH };
	}

	if (verified === VerifyOutcomes.unreachable) {
		return { body: '', status: UNAVAILABLE };
	}

	if (deps.credentials.push(credential) === PushOutcomes.idMismatch) {
		return { body: '', status: ID_MISMATCH };
	}

	return {
		body: JSON.stringify({ version: deps.version.current }),
		status: 200,
	};
}
