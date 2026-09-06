import type { PlayerIdentity } from './PlayerIdentity';

export const API_VERSION = 1;

// Process-lifetime fields only. The server serves these bytes verbatim without asking again, so
// anything that changes belongs in the beacon or /state.
export function helloBody(identity: PlayerIdentity): string {
	return JSON.stringify({
		apiVersions: [API_VERSION],
		id: identity.id,
		name: identity.name,
		tier: identity.tier,
		// short because the beacon repeats it in every datagram, where there is no header to carry it
		v: API_VERSION,
		version: identity.version,
	});
}
