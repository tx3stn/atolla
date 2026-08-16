import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';
import { PII_PARAM, redactSensitiveUrlParams, SENSITIVE_PARAM } from './RedactUrl';

const REDACTABLE_KEY = fc.constantFrom(
	'api_key',
	'apiKey',
	'access_token',
	'accessToken',
	'token',
	'tok',
	'X-Emby-Token',
	'password',
	'pwd',
	'auth',
	'secret',
	'userId',
	'user_id',
	'deviceId',
	'device_id',
);

const BENIGN_KEY = fc.constantFrom('tag', 'maxWidth', 'c', 'u', 'static', 'trackId', 'limit');

function stringOf(alphabet: string, minLength: number, maxLength: number): fc.Arbitrary<string> {
	return fc.string({ maxLength, minLength, unit: fc.constantFrom(...alphabet.split('')) });
}

// The longest fixed run in the scaffolding these secrets are embedded in is
// 'X-Emby-Token' at 12, so a shorter secret could be generated equal to a key
// or path segment and fail the no-leak assertion without the redactor being at fault.
const secretValue = stringOf('ABCDEFabcdef0123456789-_.~', 16, 48);
const benignValue = stringOf('0123456789', 1, 6);

describe('SENSITIVE_PARAM', () => {
	it('matches token-carrying param names', () => {
		for (const key of ['api_key', 'apikey', 'access_token', 'token', 'tok', 'X-Emby-Token']) {
			expect(SENSITIVE_PARAM.test(key)).toBe(true);
		}
	});

	it('does not match benign or PII param names', () => {
		for (const key of ['tag', 'maxWidth', 'c', 'u', 'userId', 'deviceId']) {
			expect(SENSITIVE_PARAM.test(key)).toBe(false);
		}
	});
});

describe('PII_PARAM', () => {
	it('matches user/device identifier param names', () => {
		for (const key of ['userId', 'user_id', 'deviceId', 'device_id']) {
			expect(PII_PARAM.test(key)).toBe(true);
		}
	});

	it('does not match benign or secret param names', () => {
		for (const key of ['tag', 'trackId', 'api_key', 'token']) {
			expect(PII_PARAM.test(key)).toBe(false);
		}
	});
});

describe('redactSensitiveUrlParams', () => {
	it('redacts api_key and the host while keeping other params', () => {
		expect(
			redactSensitiveUrlParams('https://host/Items/1/Images/Primary?api_key=SECRET&tag=abc'),
		).toBe('<host>/Items/1/Images/Primary?api_key=<redacted>&tag=abc');
	});

	it('redacts the atolla-cache tok param and leaves the non-http scheme host intact', () => {
		expect(redactSensitiveUrlParams('atolla-cache://image?c=album_art&u=x&tok=SECRET')).toBe(
			'atolla-cache://image?c=album_art&u=x&tok=<redacted>',
		);
	});

	it('redacts the scheme and host of an http(s) URL', () => {
		expect(redactSensitiveUrlParams('https://music.example.com:8096/Audio/42/stream.mp3')).toBe(
			'<host>/Audio/42/stream.mp3',
		);
	});

	it('redacts userId and deviceId as PII while keeping benign params', () => {
		expect(
			redactSensitiveUrlParams(
				'https://host/Audio/42/stream.mp3?deviceId=ABC&static=true&userId=U123',
			),
		).toBe('<host>/Audio/42/stream.mp3?deviceId=<redacted>&static=true&userId=<redacted>');
	});

	it('redacts a secret embedded as a JSON field value', () => {
		const redacted = redactSensitiveUrlParams(
			JSON.stringify({ accessToken: 'SECRET', trackId: '42' }),
		);
		expect(redacted).not.toContain('SECRET');
		expect(redacted).toContain('"accessToken":"<redacted>"');
		expect(redacted).toContain('"trackId":"42"');
	});

	it('redacts userId embedded as a JSON field value', () => {
		expect(redactSensitiveUrlParams(JSON.stringify({ userId: 'U123' }))).toBe(
			'{"userId":"<redacted>"}',
		);
	});

	it('redacts secrets embedded in a serialized URL blob without touching the rest', () => {
		const blob = JSON.stringify({ next: 'https://host/a?api_key=SECRET', trackId: '42' });
		const redacted = redactSensitiveUrlParams(blob);
		expect(redacted).not.toContain('SECRET');
		expect(redacted).toContain('api_key=<redacted>');
		expect(redacted).toContain('"trackId":"42"');
	});

	it('redacts the host but leaves benign params on token-free text', () => {
		expect(redactSensitiveUrlParams('https://host/a?tag=abc&maxWidth=384')).toBe(
			'<host>/a?tag=abc&maxWidth=384',
		);
	});
});

describe('redactSensitiveUrlParams properties', () => {
	it('never leaks a secret carried by a sensitive query param', () => {
		fc.assert(
			fc.property(
				REDACTABLE_KEY,
				secretValue,
				fc.array(fc.tuple(BENIGN_KEY, benignValue), { maxLength: 4 }),
				(key, secret, benign) => {
					const params = [`${key}=${secret}`, ...benign.map(([k, v]) => `${k}=${v}`)];
					const url = `https://music.example.com/Items?${params.join('&')}`;

					expect(redactSensitiveUrlParams(url)).not.toContain(secret);
				},
			),
		);
	});

	it('never leaks a secret carried by a sensitive JSON field', () => {
		fc.assert(
			fc.property(REDACTABLE_KEY, secretValue, benignValue, (key, secret, trackId) => {
				const blob = JSON.stringify({ [key]: secret, nested: { trackId }, trackId });

				expect(redactSensitiveUrlParams(blob)).not.toContain(secret);
			}),
		);
	});

	it('never leaks a secret embedded in a URL inside a serialized blob', () => {
		fc.assert(
			fc.property(REDACTABLE_KEY, secretValue, (key, secret) => {
				const blob = JSON.stringify({ next: `https://music.example.com/a?${key}=${secret}` });

				expect(redactSensitiveUrlParams(blob)).not.toContain(secret);
			}),
		);
	});

	it('leaves benign param values untouched', () => {
		fc.assert(
			fc.property(BENIGN_KEY, benignValue, (key, value) => {
				expect(redactSensitiveUrlParams(`https://music.example.com/a?${key}=${value}`)).toBe(
					`<host>/a?${key}=${value}`,
				);
			}),
		);
	});

	it('strips the scheme and authority of every http(s) URL, including any userinfo', () => {
		fc.assert(
			fc.property(fc.webAuthority({ withPort: true, withUserInfo: true }), (authority) => {
				const redacted = redactSensitiveUrlParams(`https://${authority}/Audio/42/stream.mp3`);

				expect(redacted).toBe('<host>/Audio/42/stream.mp3');
			}),
		);
	});

	it('is idempotent', () => {
		fc.assert(
			fc.property(
				fc.array(fc.tuple(fc.oneof(REDACTABLE_KEY, BENIGN_KEY), benignValue), { maxLength: 5 }),
				(params) => {
					const query =
						params.length === 0 ? '' : `?${params.map(([k, v]) => `${k}=${v}`).join('&')}`;
					const once = redactSensitiveUrlParams(`https://music.example.com/Items${query}`);

					expect(redactSensitiveUrlParams(once)).toBe(once);
				},
			),
		);
	});

	it('never leaks a secret built from the sub-delimiters a query value may contain', () => {
		fc.assert(
			fc.property(REDACTABLE_KEY, stringOf(`ABCabc0123-_.~'!$()*+,;:@`, 16, 48), (key, secret) => {
				const url = `https://music.example.com/a?${key}=${secret}`;

				expect(redactSensitiveUrlParams(url)).not.toContain(secret);
			}),
		);
	});
});
