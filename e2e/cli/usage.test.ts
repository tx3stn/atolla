import { describe, expect, it } from 'bun:test';
import { Cli, cliPath } from './cli';

const cli = new Cli(cliPath());

describe('atolla', () => {
	it('reports a version', () => {
		const result = cli.version();

		expect(result.code).toBe(0);
		expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+(-[\w.-]+)?$/);
	});

	it('prints help naming every command when given no arguments', () => {
		const result = cli.help();

		expect(result.code).toBe(0);
		for (const command of ['config', 'init', 'pair', 'run']) {
			expect(result.stdout).toContain(command);
		}
	});

	it('rejects an unknown command, naming it', () => {
		const result = cli.invoke('bogus');

		expect(result.code).toBe(1);
		expect(result.stdout).toContain('bogus');
	});

	it('rejects an unknown flag, naming it', () => {
		const result = cli.pair('--bogus');

		expect(result.code).toBe(1);
		expect(result.stdout).toContain('--bogus');
	});

	it('rejects a global flag given without its value', () => {
		const result = cli.invoke('--config');

		expect(result.code).toBe(1);
		expect(result.stdout).toContain('--config');
	});

	it('writes nothing to stderr, even when reporting an error', () => {
		expect(cli.help().stderr).toBe('');
		expect(cli.invoke('bogus').stderr).toBe('');
	});

	it('emits no escape sequences', () => {
		expect(cli.help().stdout).not.toContain('\x1b[');
	});
});
