import { describe, expect, it } from 'bun:test';
import { mathRandomBytes } from './Random';

describe('mathRandomBytes', () => {
	it('returns the requested number of bytes', () => {
		expect(mathRandomBytes(8).length).toBe(8);
	});

	it('returns values inside the byte range', () => {
		const bytes = mathRandomBytes(256);

		expect(bytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)).toBe(true);
	});

	it('does not return the same bytes twice', () => {
		expect(mathRandomBytes(16).toString()).not.toBe(mathRandomBytes(16).toString());
	});
});
