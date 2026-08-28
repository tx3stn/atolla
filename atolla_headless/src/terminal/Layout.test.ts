import { describe, expect, it } from 'bun:test';
import { beside, fields } from './Layout';
import { makeTerminal } from './Terminal';

const plain = makeTerminal(() => {}, false);

describe('fields', () => {
	it('pads every label to the longest one', () => {
		expect(
			fields(plain, [
				{ label: 'name', value: 'Kitchen' },
				{ label: 'audio device', value: 'hw:2,0' },
			]),
		).toEqual(['name         : Kitchen', 'audio device : hw:2,0']);
	});
});

describe('beside', () => {
	it('pads the left column when the right one is longer', () => {
		expect(beside(['aaa'], 3, ['1', '2', '3'])).toEqual(['aaa    1', '       2', '       3']);
	});

	it('drops the gutter when the right column runs out', () => {
		expect(beside(['aaa', 'bbb'], 3, ['1'])).toEqual(['aaa    1', 'bbb']);
	});

	it('leaves no trailing whitespace on any line', () => {
		for (const line of beside(['aaa', 'bbb'], 3, ['1'])) {
			expect(line).toBe(line.replace(/\s+$/, ''));
		}
	});
});
