import { describe, expect, it } from 'bun:test';
import { handleClock } from './Clock';

describe('handleClock', () => {
	it('answers unavailable when the player serves no clock', async () => {
		const answer = await handleClock({ clock: { reading: () => null } });

		expect(answer.status).toBe(503);
	});
});
