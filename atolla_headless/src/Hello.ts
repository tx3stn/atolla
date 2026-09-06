import type { PlayerIdentity } from './PlayerIdentity';

export const PROTOCOL_VERSION = 1;

// Process-lifetime fields only. The server serves these bytes verbatim without asking again, so
// anything that changes belongs in the beacon or /state.
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
