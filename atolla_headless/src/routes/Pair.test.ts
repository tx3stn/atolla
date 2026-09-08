import { describe, expect, it } from 'bun:test';
import { InMemoryKeyValueStore } from 'atolla_core/src/stores/KeyValueStore';
import { CONTROLLERS_KEY, MEDIA_SERVER_KEY } from '../Pairing';
import type { RandomBytes } from '../Random';
import { handlePair, type PairDeps } from './Pair';

const CODE = '19524002';

const MEDIA_SERVER = {
	accessToken: 'jf-token',
	baseUrl: 'http://jellyfin.local:8096',
	deviceId: 'c2be50c9b97e1c53',
	userId: 'u1',
};

function counting(): RandomBytes {
	let next = 0;
	return (count) => Uint8Array.from({ length: count }, () => next++ & 0xff);
}

function fixture(): { deps: PairDeps; secrets: InMemoryKeyValueStore } {
	const secrets = new InMemoryKeyValueStore();

	return { deps: { randomBytes: counting(), secrets }, secrets };
}

function body(extra: Record<string, unknown> = {}): string {
	return JSON.stringify({
		code: CODE,
		controllerId: 'c1',
		controllerName: 'grapheneOS phone',
		...extra,
	});
}

describe('handlePair', () => {
	it('answers with the token it minted', async () => {
		const answer = await handlePair(fixture().deps, body());

		expect(answer.status).toBe(200);
		expect(JSON.parse(answer.body)).toEqual({ token: expect.stringMatching(/^[0-9a-f]{64}$/) });
	});

	it('persists the controller against the token it answered with', async () => {
		const { deps, secrets } = fixture();

		const answer = await handlePair(deps, body());
		const [held] = JSON.parse(await secrets.fetchString(CONTROLLERS_KEY));

		expect(held.token).toBe(JSON.parse(answer.body).token);
		expect(held.controllerId).toBe('c1');
	});

	it('stores the media server credentials a controller provisioned it with', async () => {
		const { deps, secrets } = fixture();

		await handlePair(deps, body({ mediaServer: MEDIA_SERVER }));

		expect(JSON.parse(await secrets.fetchString(MEDIA_SERVER_KEY))).toEqual(MEDIA_SERVER);
	});

	it('writes nothing where the credentials go when none were sent', async () => {
		const { deps, secrets } = fixture();

		await handlePair(deps, body());

		expect(secrets.fetchString(MEDIA_SERVER_KEY)).rejects.toThrow();
	});
});
