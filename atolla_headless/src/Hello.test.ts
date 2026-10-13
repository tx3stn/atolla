import { describe, expect, it } from 'bun:test';
import { API_VERSION, helloBody } from './Hello';
import type { PlayerIdentity } from './PlayerIdentity';

const IDENTITY: PlayerIdentity = {
	id: 'c2be50c9b97e1c53',
	name: 'Kitchen',
	tier: 'tight',
	version: '0.11.3',
};

describe('helloBody', () => {
	it('identifies the player, and the port it streams audio on', () => {
		expect(JSON.parse(helloBody(IDENTITY, 45891))).toEqual({
			apiVersions: [API_VERSION],
			audioPort: 45891,
			id: 'c2be50c9b97e1c53',
			name: 'Kitchen',
			tier: 'tight',
			v: API_VERSION,
			version: '0.11.3',
		});
	});

	it('leaves the audio port out when it streams none, so it cannot be chosen as a source', () => {
		expect(JSON.parse(helloBody(IDENTITY, null))).not.toHaveProperty('audioPort');
	});

	it('survives a name that needs escaping', () => {
		const body = helloBody({ ...IDENTITY, name: 'Big Dave\'s "Den"' }, 45891);

		expect(JSON.parse(body).name).toBe('Big Dave\'s "Den"');
	});
});
