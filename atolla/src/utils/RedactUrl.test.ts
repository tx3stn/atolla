import { describe, expect, it } from 'bun:test';
import { PII_PARAM, redactSensitiveUrlParams, SENSITIVE_PARAM } from './RedactUrl';

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
