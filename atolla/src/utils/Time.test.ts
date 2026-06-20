import { describe, expect, it } from 'bun:test';
import { formatDuration } from './Time';

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
});
