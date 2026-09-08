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
	it('identifies the player', () => {
		expect(JSON.parse(helloBody(IDENTITY))).toEqual({
			apiVersions: [API_VERSION],
			id: 'c2be50c9b97e1c53',
			name: 'Kitchen',
			tier: 'tight',
			v: API_VERSION,
			version: '0.11.3',
		});
	});

	it('survives a name that needs escaping', () => {
		const body = helloBody({ ...IDENTITY, name: 'Big Dave\'s "Den"' });

		expect(JSON.parse(body).name).toBe('Big Dave\'s "Den"');
	});
});
