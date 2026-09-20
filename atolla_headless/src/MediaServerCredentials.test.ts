import { describe, expect, it } from 'bun:test';
import type { MediaServer } from 'atolla_sync/src/api/generated';
import { makeMediaServerCredentials, PushOutcomes } from './MediaServerCredentials';
import { makeStateVersion } from './StateVersion';

function credential(userId: string, overrides: Partial<MediaServer> = {}): MediaServer {
	return {
		accessToken: `token-${userId}`,
		baseUrl: 'http://jellyfin.local:8096',
		deviceId: `atolla-c2be50c9b97e1c53-${userId}`,
		serverId: 's1',
		userId,
		...overrides,
	};
}

function fixture() {
	const version = makeStateVersion();

	return { credentials: makeMediaServerCredentials(version), version };
}

describe('makeMediaServerCredentials', () => {
	it('holds nothing until something is pushed', () => {
		const { credentials } = fixture();

		expect(credentials.userIds()).toEqual([]);
		expect(credentials.get('u1')).toBeNull();
	});

	it('hands back the credential it was given', () => {
		const { credentials } = fixture();
		const pushed = credential('u1');

		expect(credentials.push(pushed)).toBe(PushOutcomes.stored);
		expect(credentials.get('u1')).toEqual(pushed);
	});

	it('holds one credential per account', () => {
		const { credentials } = fixture();

		credentials.push(credential('u1'));
		credentials.push(credential('u2'));

		expect(credentials.userIds()).toEqual(['u1', 'u2']);
		expect(credentials.get('u2')?.accessToken).toBe('token-u2');
	});

	it('replaces the credential an account already had', () => {
		const { credentials } = fixture();

		credentials.push(credential('u1'));
		credentials.push(credential('u1', { accessToken: 'minted-again' }));

		expect(credentials.userIds()).toEqual(['u1']);
		expect(credentials.get('u1')?.accessToken).toBe('minted-again');
	});

	it('refuses a credential for a different server', () => {
		const { credentials } = fixture();

		credentials.push(credential('u1'));

		expect(credentials.push(credential('u2', { serverId: 'other' }))).toBe(PushOutcomes.idMismatch);
		expect(credentials.userIds()).toEqual(['u1']);
	});

	// Two controllers reach one server by different names, which is the case keying on the server
	// id rather than the address exists for.
	it('accepts the same server reached by another address', () => {
		const { credentials } = fixture();

		credentials.push(credential('u1'));
		const byAddress = credential('u2', { baseUrl: 'http://192.168.1.50:8096' });

		expect(credentials.push(byAddress)).toBe(PushOutcomes.stored);
		expect(credentials.get('u1')?.baseUrl).toBe('http://jellyfin.local:8096');
		expect(credentials.get('u2')?.baseUrl).toBe('http://192.168.1.50:8096');
	});

	// A controller long-polling `/state` learns the player is provisioned only if the version moves.
	it('moves the state version when it stores one', () => {
		const { credentials, version } = fixture();
		const before = version.current;

		credentials.push(credential('u1'));

		expect(version.current).toBeGreaterThan(before);
	});

	it('forgets a dropped account and moves the version with it', () => {
		const { credentials, version } = fixture();

		credentials.push(credential('u1'));
		credentials.push(credential('u2'));
		const before = version.current;

		credentials.drop('u1');

		expect(credentials.userIds()).toEqual(['u2']);
		expect(credentials.get('u1')).toBeNull();
		expect(version.current).toBeGreaterThan(before);
	});

	it('leaves the state version alone when it drops an account it never held', () => {
		const { credentials, version } = fixture();

		credentials.push(credential('u1'));
		const before = version.current;

		credentials.drop('u2');

		expect(version.current).toBe(before);
	});

	it('leaves the state version alone when it refuses one', () => {
		const { credentials, version } = fixture();

		credentials.push(credential('u1'));
		const before = version.current;

		credentials.push(credential('u2', { serverId: 'other' }));

		expect(version.current).toBe(before);
	});

	it('tells a listener when the accounts it holds change', () => {
		const { credentials } = fixture();
		let changes = 0;

		credentials.subscribe(() => {
			changes++;
		});
		credentials.push(credential('u1'));
		credentials.drop('u1');

		expect(changes).toBe(2);
	});

	it('says nothing when a push is refused or a drop finds nothing', () => {
		const { credentials } = fixture();
		let changes = 0;

		credentials.push(credential('u1'));
		credentials.subscribe(() => {
			changes++;
		});
		credentials.push(credential('u2', { serverId: 'other' }));
		credentials.drop('u3');

		expect(changes).toBe(0);
	});

	it('stops telling a listener that has unsubscribed', () => {
		const { credentials } = fixture();
		let changes = 0;
		const unsubscribe = credentials.subscribe(() => {
			changes++;
		});

		unsubscribe();
		credentials.push(credential('u1'));

		expect(changes).toBe(0);
	});
});
