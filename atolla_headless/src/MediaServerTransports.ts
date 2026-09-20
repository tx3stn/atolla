import { AuthErrors } from 'atolla_core/src/services/AuthErrors';
import { getLogger } from 'atolla_core/src/services/Logger';
import type { Transport } from 'atolla_core/src/transports/Transport';
import { isErrorConst } from 'atolla_core/src/utils/Errors';
import { createClientHeader } from 'atolla_jellyfin/src/ClientIdentity';
import { LiveTransport } from 'atolla_jellyfin/src/transports/Live';
import type { MediaServer } from 'atolla_sync/src/api/generated';
import type { IHTTPClient } from 'valdi_http/src/IHTTPClient';
import type { MediaServerCredentials } from './MediaServerCredentials';
import type { PlayerIdentity } from './PlayerIdentity';

// Under the daemon's 28s handler budget with room for the file write `POST /pair` does after it.
const VERIFY_TIMEOUT_MS = 10_000;

export const VerifyOutcomes = {
	mismatch: 'mismatch',
	unreachable: 'unreachable',
	verified: 'verified',
} as const;

export type VerifyOutcome = (typeof VerifyOutcomes)[keyof typeof VerifyOutcomes];

export type MakeHttpClient = (baseUrl: string) => IHTTPClient;

interface BuildOptions {
	onSessionExpired?: () => void;
	requestTimeoutMs?: number;
}

export interface MediaServerAccess {
	authHeader: string;
	transport: Transport;
}

export interface MediaServerTransportsDeps {
	credentials: MediaServerCredentials;
	identity: PlayerIdentity;
	makeHttpClient: MakeHttpClient;
}

export interface MediaServerTransports {
	forUser(userId: string): MediaServerAccess | null;
	verify(credential: MediaServer): Promise<VerifyOutcome>;
}

const log = getLogger('media-server-transports');

export function makeMediaServerTransports(deps: MediaServerTransportsDeps): MediaServerTransports {
	const cached = new Map<string, { access: MediaServerAccess; credential: MediaServer }>();

	const build = (credential: MediaServer, options: BuildOptions): MediaServerAccess => ({
		authHeader: createClientHeader(
			{ deviceId: credential.deviceId, deviceName: deps.identity.name },
			credential.accessToken,
		),
		transport: new LiveTransport(
			credential.baseUrl,
			credential.accessToken,
			credential.userId,
			deps.makeHttpClient(credential.baseUrl),
			{
				clientDeviceId: credential.deviceId,
				clientDeviceName: deps.identity.name,
				onSessionExpired: options.onSessionExpired,
				requestTimeoutMs: options.requestTimeoutMs,
			},
		),
	});

	return {
		forUser: (userId) => {
			const credential = deps.credentials.get(userId);
			if (credential === null) {
				cached.delete(userId);
				return null;
			}

			const held = cached.get(userId);
			if (held !== undefined && held.credential === credential) {
				return held.access;
			}

			const access = build(credential, {
				onSessionExpired: () => {
					log.warn('credential rejected, dropped', { userId });
					deps.credentials.drop(userId);
				},
			});
			cached.set(userId, { access, credential });

			return access;
		},
		// No onSessionExpired here: a re-push carrying a dead token would evict the working
		// credential this account is already streaming with.
		verify: async (credential) => {
			const { transport } = build(credential, { requestTimeoutMs: VERIFY_TIMEOUT_MS });

			try {
				const user = await transport.getUser();
				return user.id === credential.userId ? VerifyOutcomes.verified : VerifyOutcomes.mismatch;
			} catch (error) {
				if (error === AuthErrors.SESSION_EXPIRED) {
					return VerifyOutcomes.mismatch;
				}

				log.warn('could not reach the media server', {
					error: isErrorConst(error) ? error.err : String(error),
				});
				return VerifyOutcomes.unreachable;
			}
		},
	};
}
