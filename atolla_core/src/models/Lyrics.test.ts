import { describe, expect, it } from 'bun:test';
import { activeLineIndex, type LyricLine } from './Lyrics';

const synced: Array<LyricLine> = [
	{ startSeconds: 3, text: 'first' },
	{ startSeconds: 5, text: 'second' },
	{ startSeconds: 12, text: '' },
	{ startSeconds: 14, text: 'fourth' },
];

describe('activeLineIndex', () => {
	it('reports no active line before the first timestamp', () => {
		expect(activeLineIndex(synced, 0)).toBe(-1);
		expect(activeLineIndex(synced, 2.9)).toBe(-1);
	});

	it('activates a line the moment its timestamp is reached', () => {
		expect(activeLineIndex(synced, 3)).toBe(0);
		expect(activeLineIndex(synced, 5)).toBe(1);
		expect(activeLineIndex(synced, 14)).toBe(3);
	});

	it('holds the previous line through the gap until the next one starts', () => {
		expect(activeLineIndex(synced, 4.9)).toBe(0);
		expect(activeLineIndex(synced, 11.99)).toBe(1);
	});

	it('activates a blank line, which is a real timed line in an LRC', () => {
		expect(activeLineIndex(synced, 12)).toBe(2);
		expect(activeLineIndex(synced, 13)).toBe(2);
	});

	it('holds the last line for the rest of the track', () => {
		expect(activeLineIndex(synced, 79)).toBe(3);
		expect(activeLineIndex(synced, 6000)).toBe(3);
	});

	it('reports no active line for lyrics with no timestamps', () => {
		const unsynced = [{ text: 'first' }, { text: 'second' }];
		expect(activeLineIndex(unsynced, 30)).toBe(-1);
	});

	it('skips untimed lines mixed in with timed ones', () => {
		const mixed: Array<LyricLine> = [
			{ startSeconds: 3, text: 'timed' },
			{ text: 'untimed' },
			{ startSeconds: 10, text: 'timed again' },
		];
		expect(activeLineIndex(mixed, 5)).toBe(0);
		expect(activeLineIndex(mixed, 10)).toBe(2);
	});

	it('reports no active line for an empty list', () => {
		expect(activeLineIndex([], 10)).toBe(-1);
	});
});
