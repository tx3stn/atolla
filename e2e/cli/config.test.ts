import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cli } from './cli';

const FRENCH_STRINGS = fileURLToPath(
	new URL('../../atolla_headless/strings/strings-fr-FR.json', import.meta.url),
);

let dir: string;
let configPath: string;
let cli: Cli;

function french(key: string): string {
	return JSON.parse(readFileSync(FRENCH_STRINGS, 'utf8'))[key].defaultMessage;
}

function stored(): Record<string, unknown> {
	return JSON.parse(readFileSync(configPath, 'utf8'));
}

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'atolla-cli-'));
	configPath = join(dir, 'etc', 'player.json');
	cli = new Cli({ config: configPath });
});

afterEach(() => {
	rmSync(dir, { force: true, recursive: true });
});

describe('atolla config', () => {
	it('updates a config written moments earlier by init', () => {
		cli.init('--name', 'Kitchen');

		const result = cli.config('--name', 'Bedroom');

		expect(result.code).toBe(0);
		expect(stored().name).toBe('Bedroom');
	});

	it('prints the configuration that is on disk', () => {
		cli.init('--name', 'Kitchen');

		const result = cli.config();

		expect(result.code).toBe(0);
		expect(JSON.parse(result.stdout.slice(result.stdout.indexOf('{')))).toEqual(stored());
	});

	it('leaves fields it was not asked to change alone', () => {
		cli.init('--name', 'Kitchen');
		const before = stored();

		cli.config('--name', 'Bedroom');

		expect(stored()).toEqual({ ...before, name: 'Bedroom' });
	});

	it('rejects a port outside the valid range, leaving the config untouched', () => {
		cli.init('--name', 'Kitchen');
		const before = readFileSync(configPath, 'utf8');

		const result = cli.config('--port', '99999');

		expect(result.code).toBe(1);
		expect(result.stdout).toContain('99999');
		expect(readFileSync(configPath, 'utf8')).toBe(before);
	});

	it('rejects an unknown language, leaving the config untouched', () => {
		cli.init('--name', 'Kitchen');
		const before = readFileSync(configPath, 'utf8');

		const result = cli.config('--language', 'xx');

		expect(result.code).toBe(1);
		expect(readFileSync(configPath, 'utf8')).toBe(before);
	});

	it('names the config it was pointed at when there is none, and how to make one', () => {
		const result = cli.config();

		expect(result.code).toBe(1);
		expect(result.stdout).toContain(configPath);
		expect(result.stdout).toContain('atolla init');
	});

	// the only test that exercises the generated strings bundle: every unit test replaces
	// atolla_headless/src/Strings with a proxy, so none of them prove it is linked into the binary
	it('reports in the configured language', () => {
		cli.init('--language', 'fr', '--name', 'Cuisine');

		const result = cli.config('--name', 'Chambre');

		expect(result.stdout).toContain(french('config_updated'));
	});
});
