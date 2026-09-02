import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Cli } from './cli';

let dir: string;
let configPath: string;
let cli: Cli;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'atolla-cli-'));
	// nested, so "the parent directory does not exist" is the default posture rather than a special case
	configPath = join(dir, 'etc', 'player.json');
	cli = new Cli({ config: configPath });
});

afterEach(() => {
	rmSync(dir, { force: true, recursive: true });
});

describe('atolla init', () => {
	it('creates the config when its parent directory does not exist', () => {
		const result = cli.init('--name', 'Kitchen');

		expect(result.code).toBe(0);
		expect(existsSync(configPath)).toBe(true);
	});

	it('records the name and language it was given', () => {
		cli.init('--name', 'Kitchen', '--language', 'fr');

		const written = JSON.parse(readFileSync(configPath, 'utf8'));
		expect(written.name).toBe('Kitchen');
		expect(written.language).toBe('fr');
	});

	it('refuses to overwrite an existing config, leaving it untouched', () => {
		cli.init('--name', 'Kitchen');
		const before = readFileSync(configPath, 'utf8');

		const result = cli.init('--name', 'Bedroom');

		expect(result.code).toBe(1);
		expect(result.stdout).toContain(configPath);
		expect(readFileSync(configPath, 'utf8')).toBe(before);
	});

	it('rejects an unknown language and writes nothing', () => {
		const result = cli.init('--language', 'xx');

		expect(result.code).toBe(1);
		expect(result.stdout).toContain('xx');
		expect(existsSync(configPath)).toBe(false);
	});
});
