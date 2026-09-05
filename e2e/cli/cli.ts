import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const READY_TIMEOUT_MS = 10_000;
const READY_POLL_MS = 50;

export interface CliGlobals {
	config?: string;
	logLevel?: string;
}

export interface CliResult {
	code: number | null;
	signal: string | null;
	stderr: string;
	stdout: string;
}

export interface PlayerConfigFile {
	audioDevice?: string;
	dataDir?: string;
	language?: string;
	logLevel?: string;
	name?: string;
	port?: number;
}

export interface Daemon {
	output: () => string;
	port: number;
	stop: () => Promise<void>;
}

export function pairingCode(stdout: string): string {
	const match = stdout.match(/^code: (\d{4}) (\d{4})$/m);
	if (match === null) {
		throw new Error(`no pairing code line in output:\n${stdout}`);
	}

	return `${match[1]}${match[2]}`;
}

export class Cli {
	private readonly binary = process.env.ATOLLA_CLI ?? join(REPO_ROOT, 'build/atolla');

	constructor(private readonly globals: CliGlobals = {}) {}

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

	// the only command that never exits, so it hands back a handle rather than a finished result
	async run(...args: Array<string>): Promise<Daemon> {
		const { port } = this.configFile();
		if (port === undefined) {
			throw new Error('the config sets no port, so the control port to wait on is unknown');
		}

		const child = spawn(this.binary, this.argv(['run', ...args]));

		let output = '';
		child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
			output += chunk;
		});
		child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
			output += chunk;
		});

		const daemon: Daemon = { output: () => output, port, stop: () => stop(child) };
		const deadline = Date.now() + READY_TIMEOUT_MS;

		while (Date.now() < deadline) {
			if (child.exitCode !== null || child.signalCode !== null) {
				throw new Error(`run exited before listening:\n${output}`);
			}

			if (await responds(port)) {
				return daemon;
			}

			await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
		}

		await daemon.stop();

		throw new Error(`run did not listen on ${port} within ${READY_TIMEOUT_MS}ms:\n${output}`);
	}

	version(): CliResult {
		return this.exec(['--version']);
	}

	// every field is optional: the file is whatever a test wrote, and the daemon defaults the rest
	private configFile(): PlayerConfigFile {
		const { config } = this.globals;
		if (config === undefined) {
			throw new Error('no --config was given, so its contents cannot be read');
		}

		return JSON.parse(readFileSync(config, 'utf8')) as PlayerConfigFile;
	}

	private argv(args: Array<string>): Array<string> {
		const { config, logLevel } = this.globals;

		return [
			'--no-color',
			...(config === undefined ? [] : ['--config', config]),
			...(logLevel === undefined ? [] : ['--log-level', logLevel]),
			...args,
		];
	}

	private exec(args: Array<string>): CliResult {
		const argv = this.argv(args);
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

// any answer means the port is bound; the status is the test's business, not readiness'
async function responds(port: number): Promise<boolean> {
	try {
		await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(READY_POLL_MS * 10) });
		return true;
	} catch {
		return false;
	}
}

function stop(child: ChildProcess): Promise<void> {
	if (child.exitCode !== null || child.signalCode !== null) {
		return Promise.resolve();
	}

	return new Promise((resolve) => {
		child.once('exit', () => resolve());
		child.kill('SIGTERM');
	});
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
