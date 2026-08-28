import { describe, expect, it } from 'bun:test';
import { BELL_STOPS, channels, sample, TENTACLE_STOPS } from './Gradient';

describe('channels', () => {
	it('splits a hex colour into rgb', () => {
		expect(channels('#AA5CC3')).toEqual([0xaa, 0x5c, 0xc3]);
	});

	it('handles a channel of zero', () => {
		expect(channels('#00A4DC')).toEqual([0, 0xa4, 0xdc]);
	});
});

describe('sample', () => {
	it('returns the stop colour exactly at a stop offset', () => {
		expect(sample(BELL_STOPS, 0)).toBe('#aa5cc3');
		expect(sample(BELL_STOPS, 0.22)).toBe('#8b62d3');
		expect(sample(BELL_STOPS, 1)).toBe('#57b3e8');
	});

	it('interpolates between the bracketing stops', () => {
		expect(sample(BELL_STOPS, 0.11)).toBe('#9b5fcb');
	});

	it('clamps out-of-range positions to the end stops', () => {
		expect(sample(BELL_STOPS, -3)).toBe(sample(BELL_STOPS, 0));
		expect(sample(BELL_STOPS, 12)).toBe(sample(BELL_STOPS, 1));
	});

	it('keeps every channel between the bracketing stops', () => {
		for (let i = 0; i <= 100; i++) {
			const [red, green, blue] = channels(sample(TENTACLE_STOPS, i / 100));
			expect(red).toBeGreaterThanOrEqual(0);
			expect(red).toBeLessThanOrEqual(0x2e);
			expect(green).toBeGreaterThanOrEqual(0x2a);
			expect(blue).toBeLessThanOrEqual(0xdc);
		}
	});
});
