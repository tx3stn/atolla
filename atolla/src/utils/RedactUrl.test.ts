import { describe, expect, it } from 'bun:test';
import { redactSensitiveUrlParams, SENSITIVE_PARAM } from './RedactUrl';

describe('SENSITIVE_PARAM', () => {
	it('matches token-carrying param names', () => {
		for (const key of ['api_key', 'apikey', 'access_token', 'token', 'tok', 'X-Emby-Token']) {
			expect(SENSITIVE_PARAM.test(key)).toBe(true);
		}
	});

	it('does not match benign param names', () => {
		for (const key of ['tag', 'maxWidth', 'c', 'u', 'userId']) {
			expect(SENSITIVE_PARAM.test(key)).toBe(false);
		}
	});
});

describe('redactSensitiveUrlParams', () => {
	it('redacts api_key while keeping other params', () => {
		expect(
			redactSensitiveUrlParams('https://host/Items/1/Images/Primary?api_key=SECRET&tag=abc'),
		).toBe('https://host/Items/1/Images/Primary?api_key=<redacted>&tag=abc');
	});

	it('redacts the atolla-cache tok param', () => {
		expect(redactSensitiveUrlParams('atolla-cache://image?c=album_art&u=x&tok=SECRET')).toBe(
			'atolla-cache://image?c=album_art&u=x&tok=<redacted>',
		);
	});

	it('redacts secrets embedded in a serialized blob without touching the rest', () => {
		const blob = JSON.stringify({ next: 'https://host/a?api_key=SECRET', trackId: '42' });
		const redacted = redactSensitiveUrlParams(blob);
		expect(redacted).not.toContain('SECRET');
		expect(redacted).toContain('api_key=<redacted>');
		expect(redacted).toContain('"trackId":"42"');
	});

	it('leaves token-free text unchanged', () => {
		expect(redactSensitiveUrlParams('https://host/a?tag=abc&maxWidth=384')).toBe(
			'https://host/a?tag=abc&maxWidth=384',
		);
	});
});
