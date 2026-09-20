import { describe, expect, it } from 'bun:test';
import { AuthErrors } from 'atolla_core/src/services/AuthErrors';
import { TransportErrors } from 'atolla_core/src/transports/Errors';
import type { MediaServer } from 'atolla_sync/src/api/generated';
import type { IHTTPClient } from 'valdi_http/src/IHTTPClient';
import { makeMediaServerCredentials } from './MediaServerCredentials';
import { makeMediaServerTransports, VerifyOutcomes } from './MediaServerTransports';
import type { PlayerIdentity } from './PlayerIdentity';
import { makeStateVersion } from './StateVersion';

const IDENTITY: PlayerIdentity = {
	id: 'c2be50c9b97e1c53',
	name: 'Kitchen',
	tier: 'tight',
	version: '0.0.0',
};

function credential(userId: string, overrides: Partial<MediaServer> = {}): MediaServer {
	return {
		accessToken: `token-${userId}`,
		baseUrl: 'http://jellyfin.local:8096',
		deviceId: `atolla-${IDENTITY.id}-${userId}`,
		serverId: 's1',
		userId,
		...overrides,
	};
}

function respondingWith(responses: Array<{ body?: unknown; statusCode: number }>) {
	const calls: Array<{ headers?: Record<string, string>; pathOrUrl: string }> = [];

	const answer = () => {
		const response = responses.shift();
		if (response === undefined) {
			throw new Error('no queued response');
		}

		return Promise.resolve({
			body:
				response.body === undefined
					? undefined
					: new TextEncoder().encode(JSON.stringify(response.body)),
			headers: {},
			statusCode: response.statusCode,
		});
	};

	const client = {
		delete: () => answer(),
		get: (pathOrUrl: string, headers?: Record<string, string>) => {
			calls.push({ headers, pathOrUrl });
			return answer();
		},
		post: () => answer(),
	};

	return { calls, client: client as unknown as IHTTPClient };
}

function fixture(responses: Array<{ body?: unknown; statusCode: number }> = []) {
	const credentials = makeMediaServerCredentials(makeStateVersion());
	const baseUrls: Array<string> = [];
	const { calls, client } = respondingWith(responses);

	const transports = makeMediaServerTransports({
		credentials,
		identity: IDENTITY,
		makeHttpClient: (baseUrl) => {
			baseUrls.push(baseUrl);
			return client;
		},
	});

	return { baseUrls, calls, credentials, transports };
}

describe('forUser', () => {
	it('has nothing for an account with no credential', () => {
		const { transports } = fixture();

		expect(transports.forUser('u1')).toBeNull();
	});

	it('names the speaker rather than its device id, so the server lists it as the room', () => {
		const { credentials, transports } = fixture();
		credentials.push(credential('u1'));

		const access = transports.forUser('u1');

		expect(access?.authHeader).toContain('Client="atolla-headless"');
		expect(access?.authHeader).toContain('Device="Kitchen"');
		expect(access?.authHeader).toContain(`DeviceId="atolla-${IDENTITY.id}-u1"`);
		expect(access?.authHeader).toContain('Token="token-u1"');
	});

	// The streaming header and the transport's own requests have to agree, or the server records the
	// speaker as two devices and revoking one leaves the other working.
	it('identifies as the same client on the requests it makes', async () => {
		const { calls, credentials, transports } = fixture([
			{ body: { Id: 'u1', Name: 'Listening Room' }, statusCode: 200 },
		]);
		credentials.push(credential('u1'));

		await transports.forUser('u1')?.transport.getUser();

		expect(calls[0].headers?.Authorization).toContain('Client="atolla-headless"');
		expect(calls[0].headers?.Authorization).toContain('Device="Kitchen"');
		expect(calls[0].headers?.Authorization).toContain(`DeviceId="atolla-${IDENTITY.id}-u1"`);
	});

	it('builds one transport per account and reuses it', () => {
		const { baseUrls, credentials, transports } = fixture();
		credentials.push(credential('u1'));

		expect(transports.forUser('u1')).toBe(transports.forUser('u1'));
		expect(baseUrls).toEqual(['http://jellyfin.local:8096']);
	});

	// The credential carries the base URL, so a re-provisioned account cannot keep the old client.
	it('rebuilds when the account is pushed a new credential', () => {
		const { credentials, transports } = fixture();
		credentials.push(credential('u1'));
		const first = transports.forUser('u1');

		credentials.push(credential('u1', { accessToken: 'minted-again' }));
		const second = transports.forUser('u1');

		expect(second).not.toBe(first);
		expect(second?.authHeader).toContain('Token="minted-again"');
	});

	it('keeps each account on its own credential', () => {
		const { credentials, transports } = fixture();
		credentials.push(credential('u1'));
		credentials.push(credential('u2'));

		expect(transports.forUser('u1')?.authHeader).toContain('Token="token-u1"');
		expect(transports.forUser('u2')?.authHeader).toContain('Token="token-u2"');
	});

	it('forgets the transport once the credential is dropped', () => {
		const { credentials, transports } = fixture();
		credentials.push(credential('u1'));
		transports.forUser('u1');

		credentials.drop('u1');

		expect(transports.forUser('u1')).toBeNull();
	});
});

describe('verify', () => {
	it('accepts a token the server answers for with the same account', async () => {
		const { calls, transports } = fixture([
			{ body: { Id: 'u1', Name: 'Listening Room' }, statusCode: 200 },
		]);

		expect(await transports.verify(credential('u1'))).toBe(VerifyOutcomes.verified);
		expect(calls[0].pathOrUrl).toBe('/Users/Me');
	});

	it('refuses a token belonging to another account', async () => {
		const { transports } = fixture([{ body: { Id: 'someone-else' }, statusCode: 200 }]);

		expect(await transports.verify(credential('u1'))).toBe(VerifyOutcomes.mismatch);
	});

	it('refuses a token the server no longer honours', async () => {
		const { transports } = fixture([{ statusCode: 401 }]);

		expect(await transports.verify(credential('u1'))).toBe(VerifyOutcomes.mismatch);
	});

	it('reports a server it could not reach separately from one that said no', async () => {
		const { transports } = fixture([{ statusCode: 500 }]);

		expect(await transports.verify(credential('u1'))).toBe(VerifyOutcomes.unreachable);
	});

	it('stores nothing and evicts nothing, whichever way it goes', async () => {
		const { credentials, transports } = fixture([
			{ body: { Id: 'u1' }, statusCode: 200 },
			{ statusCode: 401 },
		]);
		credentials.push(credential('u1'));
		const held = transports.forUser('u1');

		await transports.verify(credential('u2'));
		await transports.verify(credential('u1', { accessToken: 'revoked' }));

		expect(credentials.userIds()).toEqual(['u1']);
		expect(transports.forUser('u1')).toBe(held);
	});
});

describe('a credential the server stops honouring', () => {
	it('is dropped when a request through it is rejected', async () => {
		const { credentials, transports } = fixture([{ statusCode: 401 }]);
		credentials.push(credential('u1'));

		const access = transports.forUser('u1');
		await expect(access?.transport.getUser()).rejects.toBe(AuthErrors.SESSION_EXPIRED);

		expect(credentials.get('u1')).toBeNull();
	});

	it('survives a request that merely failed', async () => {
		const { credentials, transports } = fixture([{ statusCode: 500 }]);
		credentials.push(credential('u1'));

		const access = transports.forUser('u1');
		await expect(access?.transport.getUser()).rejects.toBe(TransportErrors.LIVE_REQUEST_FAILED);

		expect(credentials.get('u1')).not.toBeNull();
	});
});
