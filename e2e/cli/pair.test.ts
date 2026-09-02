import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Cli, pairingCode } from './cli';

describe('atolla pair', () => {
	let dir: string;
	let dataDir: string;
	let configPath: string;
	let cli: Cli;

	function writeConfig(): void {
		mkdirSync(dirname(configPath), { recursive: true });
		writeFileSync(configPath, JSON.stringify({ dataDir, language: 'en', name: 'Kitchen' }));
	}

	function storedPairing(): { code: string; controllers: Array<unknown> } {
		return JSON.parse(readFileSync(join(dataDir, 'secrets', 'pairing'), 'utf8'));
	}

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'atolla-cli-'));
		dataDir = join(dir, 'data');
		configPath = join(dir, 'etc', 'player.json');
		cli = new Cli({ config: configPath });
		writeConfig();
	});

	afterEach(() => {
		rmSync(dir, { force: true, recursive: true });
	});

	it('mints a code into a data directory that does not exist yet', () => {
		expect(existsSync(dataDir)).toBe(false);

		const result = cli.pair();

		expect(result.code).toBe(0);
		expect(existsSync(join(dataDir, 'secrets', 'pairing'))).toBe(true);
	});

	it('prints the code it stored', () => {
		const result = cli.pair();

		expect(pairingCode(result.stdout)).toBe(storedPairing().code);
	});

	it('returns the same code when asked again', () => {
		const first = pairingCode(cli.pair().stdout);

		expect(pairingCode(cli.pair().stdout)).toBe(first);
	});

	it('rotates the code with --reset', () => {
		const before = pairingCode(cli.pair().stdout);

		const result = cli.pair('--reset');

		expect(result.code).toBe(0);
		expect(pairingCode(result.stdout)).not.toBe(before);
		expect(pairingCode(cli.pair().stdout)).toBe(pairingCode(result.stdout));
	});

	it('rotates again when the secrets directory already exists', () => {
		cli.pair();
		const first = cli.pair('--reset');
		const second = cli.pair('--reset');

		expect(first.code).toBe(0);
		expect(second.code).toBe(0);
		expect(pairingCode(second.stdout)).not.toBe(pairingCode(first.stdout));
	});
});
