import type { PlayerIdentity } from './PlayerIdentity';

export const API_VERSION = 1;

export function helloBody(identity: PlayerIdentity, audioPort: number | null): string {
	return JSON.stringify({
		apiVersions: [API_VERSION],
		...(audioPort === null ? {} : { audioPort }),
		id: identity.id,
		name: identity.name,
		tier: identity.tier,
		v: API_VERSION,
		version: identity.version,
	});
}
