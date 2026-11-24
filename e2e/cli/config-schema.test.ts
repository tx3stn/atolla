import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020';
import { Cli } from './cli';

interface Schema {
	properties: Record<string, { default?: unknown }>;
}

const SCHEMA_FILE = fileURLToPath(new URL('../../atolla_headless/schema.json', import.meta.url));

function readSchema(): Schema {
	return JSON.parse(readFileSync(SCHEMA_FILE, 'utf8'));
}

describe('config schema', () => {
	let dir: string;
	let configPath: string;
	let cli: Cli;

	function written(): Record<string, unknown> {
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

	it('compiles as a strict draft 2020-12 schema', () => {
		expect(() => new Ajv2020({ strict: true }).compile(readSchema())).not.toThrow();
	});

	it('atolla init writes a config that adheres to the schema', () => {
		const validate = new Ajv2020({ strict: true }).compile(readSchema());
		cli.init();

		validate(written());

		expect(validate.errors ?? null).toBeNull();
	});

	it('default values documented in schema align with code', () => {
		const defaults = Object.fromEntries(
			Object.entries(readSchema().properties).map(([field, property]) => [field, property.default]),
		);

		cli.init();

		expect(written()).toEqual(defaults);
	});
});
