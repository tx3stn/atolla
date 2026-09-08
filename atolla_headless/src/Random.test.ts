import { describe, expect, it } from 'bun:test';
import { randomHex } from './Random';

function bytes(values: Array<number>) {
	return () => Uint8Array.from(values);
}

describe('randomHex', () => {
	it('renders two characters per byte', () => {
		expect(randomHex(bytes([0xa3, 0xf1, 0xc8]), 3)).toBe('a3f1c8');
	});

	it('pads a byte that renders as a single digit', () => {
		expect(randomHex(bytes([0x00, 0x05, 0x0f]), 3)).toBe('00050f');
	});

	it('refuses fewer bytes than it asked for', () => {
		expect(() => randomHex(bytes([]), 32)).toThrow();
		expect(() => randomHex(bytes([0xa3]), 32)).toThrow();
	});

	it('asks the generator for the number of bytes it was told', () => {
		let asked = 0;

		randomHex((count) => {
			asked = count;
			return new Uint8Array(count);
		}, 32);

		expect(asked).toBe(32);
	});
});
