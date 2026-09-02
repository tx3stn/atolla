import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

export interface CliResult {
	code: number | null;
	signal: string | null;
	stderr: string;
	stdout: string;
}

export interface CliGlobals {
	config?: string;
	logLevel?: string;
}

export function cliPath(): string {
	return process.env.ATOLLA_CLI ?? join(REPO_ROOT, 'build/atolla');
}

export function pairingCode(stdout: string): string {
	const match = stdout.match(/^code: (\d{4}) (\d{4})$/m);
	if (match === null) {
		throw new Error(`no pairing code line in output:\n${stdout}`);
	}

	return `${match[1]}${match[2]}`;
}

export class Cli {
	constructor(
		private readonly binary: string,
		private readonly globals: CliGlobals = {},
	) {}

	config(...args: Array<string>): CliResult {
		return this.exec(['config', ...args]);
	}

	help(): CliResult {
		return this.exec([]);
	}

	init(...args: Array<string>): CliResult {
		return this.exec(['init', ...args]);
	}

	invoke(...args: Array<string>): CliResult {
		return this.exec(args);
	}

	pair(...args: Array<string>): CliResult {
		return this.exec(['pair', ...args]);
	}

	run(...args: Array<string>): CliResult {
		return this.exec(['run', ...args]);
	}

	version(): CliResult {
		return this.exec(['--version']);
	}

	private exec(args: Array<string>): CliResult {
		const { config, logLevel } = this.globals;
		const argv = [
			'--no-color',
			...(config === undefined ? [] : ['--config', config]),
			...(logLevel === undefined ? [] : ['--log-level', logLevel]),
			...args,
		];

		const result = spawnSync(this.binary, argv, { encoding: 'utf8' });
		if (result.error !== undefined) {
			throw spawnFailure(this.binary, result.error);
		}

		return {
			code: result.status,
			signal: result.signal,
			stderr: result.stderr ?? '',
			stdout: result.stdout ?? '',
		};
	}
}

function spawnFailure(binary: string, error: NodeJS.ErrnoException): Error {
	if (error.code === 'ENOENT') {
		return new Error(`${binary} does not exist — run \`bun run build:headless\``);
	}

	if (error.code === 'ENOEXEC') {
		return new Error(
			`${binary} will not execute on this platform — .scripts/run-headless.sh leaves a linux binary there; rebuild with \`bun run build:headless\``,
		);
	}

	return error;
}
