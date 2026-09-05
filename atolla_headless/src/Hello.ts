import type { PlayerIdentity } from './PlayerIdentity';

export const PROTOCOL_VERSION = 1;

// Only fields that are fixed for the life of the process: the server serves these bytes verbatim
// without asking JavaScript again, so anything that changes belongs in the beacon or /state.
export function helloBody(identity: PlayerIdentity): string {
	return JSON.stringify({
		id: identity.id,
		name: identity.name,
		protocolVersions: [PROTOCOL_VERSION],
		tier: identity.tier,
		v: PROTOCOL_VERSION,
		version: identity.version,
	});
}
