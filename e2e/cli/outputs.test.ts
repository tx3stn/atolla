import { describe, expect, it } from 'bun:test';
import { Cli } from './cli';

describe('atolla outputs', () => {
	it('offers the two values that work on any machine', () => {
		const result = new Cli().invoke('outputs');

		expect(result.code).toBe(0);
		expect(result.stdout.split('\n')).toContain('default');
		expect(result.stdout.split('\n')).toContain('none');
	});

	it('needs no configuration to answer', () => {
		const result = new Cli({ config: '/atolla/not/a/config.json' }).invoke('outputs');

		expect(result.code).toBe(0);
	});
});
