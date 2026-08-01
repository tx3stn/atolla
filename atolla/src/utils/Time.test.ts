import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';
import { formatDuration } from './Time';

function parseDuration(text: string): number {
	return text.split(':').reduce((total, part) => total * 60 + Number(part), 0);
}

describe('formatDuration', () => {
	it('formats sub-minute durations with an unpadded minute', () => {
		expect(formatDuration(0)).toBe('0:00');
		expect(formatDuration(5)).toBe('0:05');
	});

	it('formats minutes and seconds without an hour component', () => {
		expect(formatDuration(65)).toBe('1:05');
		expect(formatDuration(600)).toBe('10:00');
	});

	it('includes hours and zero-pads the minutes once an hour is present', () => {
		expect(formatDuration(3600)).toBe('1:00:00');
		expect(formatDuration(3661)).toBe('1:01:01');
		expect(formatDuration(7325)).toBe('2:02:05');
	});

	it('truncates a fractional second rather than printing it', () => {
		expect(formatDuration(0.5)).toBe('0:00');
		expect(formatDuration(65.9)).toBe('1:05');
	});

	it('clamps a negative duration to zero', () => {
		expect(formatDuration(-1)).toBe('0:00');
		expect(formatDuration(-3661)).toBe('0:00');
	});
});

describe('formatDuration properties', () => {
	const trackLength = fc.integer({ max: 359999, min: 0 });

	it('round-trips back to the seconds it was given', () => {
		fc.assert(
			fc.property(trackLength, (seconds) => {
				expect(parseDuration(formatDuration(seconds))).toBe(seconds);
			}),
		);
	});

	it('always produces m:ss or h:mm:ss', () => {
		fc.assert(
			fc.property(trackLength, (seconds) => {
				expect(formatDuration(seconds)).toMatch(/^\d+:[0-5]\d$|^\d+:[0-5]\d:[0-5]\d$/);
			}),
		);
	});

	it('never shrinks as the duration grows', () => {
		fc.assert(
			fc.property(trackLength, trackLength, (left, right) => {
				const [shorter, longer] = left <= right ? [left, right] : [right, left];

				expect(formatDuration(longer).length).toBeGreaterThanOrEqual(
					formatDuration(shorter).length,
				);
			}),
		);
	});

	it('produces a well-formed duration for any finite number of seconds', () => {
		fc.assert(
			fc.property(
				fc.double({ max: 359999, min: -359999, noDefaultInfinity: true, noNaN: true }),
				(seconds) => {
					expect(formatDuration(seconds)).toMatch(/^\d+:[0-5]\d$|^\d+:[0-5]\d:[0-5]\d$/);
				},
			),
		);
	});

	it('never reports more time than it was given', () => {
		fc.assert(
			fc.property(
				fc.double({ max: 359999, min: 0, noDefaultInfinity: true, noNaN: true }),
				(seconds) => {
					expect(parseDuration(formatDuration(seconds))).toBeLessThanOrEqual(seconds);
				},
			),
		);
	});
});
