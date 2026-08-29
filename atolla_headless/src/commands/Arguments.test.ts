import { describe, expect, it } from 'bun:test';
import { isErrorConst } from 'atolla_core/src/utils/Errors';
import { parseArguments } from './Arguments';
import { USAGE_ERROR } from './Errors';
import type { Flags } from './Flags';

const SPEC: Flags = {
	'--config': { describe: () => 'config path', kind: 'value' },
	'--reset': { describe: () => 'reset pairing', kind: 'boolean' },
	'--status': { describe: () => 'pairing status', kind: 'boolean' },
};

describe('parseArguments', () => {
	it('reports every declared argument as absent when none are passed', () => {
		const args = parseArguments([], SPEC);

		expect(args.flag('--reset')).toBe(false);
		expect(args.value('--config')).toBeUndefined();
	});

	it('sets boolean flags without consuming the next token', () => {
		const args = parseArguments(['--reset', '--status'], SPEC);

		expect(args.flag('--reset')).toBe(true);
		expect(args.flag('--status')).toBe(true);
	});

	it('takes the following token as a value argument', () => {
		const args = parseArguments(['--config', '/etc/atolla/player.json'], SPEC);

		expect(args.value('--config')).toBe('/etc/atolla/player.json');
	});

	it('keeps booleans and values apart', () => {
		const args = parseArguments(['--reset', '--config', '/tmp/c.json'], SPEC);

		expect(args.flag('--reset')).toBe(true);
		expect(args.value('--config')).toBe('/tmp/c.json');
		expect(args.flag('--config')).toBe(false);
		expect(args.value('--reset')).toBeUndefined();
	});

	it('accepts a value that looks like a flag', () => {
		const args = parseArguments(['--config', '--reset'], SPEC);

		expect(args.value('--config')).toBe('--reset');
		expect(args.flag('--reset')).toBe(false);
	});

	it('rejects an undeclared argument', () => {
		expect(usageDetail(['--bogus'])).toContain('--bogus');
	});

	it('rejects a value argument with nothing after it', () => {
		expect(usageDetail(['--config'])).toContain('--config');
	});

	it('rejects the same argument twice', () => {
		expect(usageDetail(['--reset', '--reset'])).toContain('--reset');
	});
});

function usageDetail(argv: Array<string>): string {
	try {
		parseArguments(argv, SPEC);
	} catch (error) {
		if (isErrorConst(error) && error.err === USAGE_ERROR.err) {
			return error.detail;
		}
		throw error;
	}
	throw new Error('expected a usage error');
}
