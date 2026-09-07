import { DEFAULT_LANGUAGE, LANGUAGE_OPTIONS, type LanguageCode } from 'atolla_core/src/Language';
import { LOG_LEVELS, type LogLevel } from 'atolla_core/src/services/Logger';
import Strings from 'atolla_headless/src/Strings';
import { CLI_ERROR } from './commands/Errors';
import { ensureDirectory } from './EnsureDirectory';

export const DEFAULT_AUDIO_DEVICE = 'default';
export const DEFAULT_BIND_ADDRESS = '0.0.0.0';
export const DEFAULT_CONFIG_PATH = '/etc/atolla/player.json';
export const DEFAULT_DATA_DIR = '/var/lib/atolla';
export const DEFAULT_LOG_LEVEL: LogLevel = 'info';
export const DEFAULT_PORT = 45889;

export interface PlayerConfig {
	audioDevice: string;
	bindAddress: string;
	dataDir: string;
	language: LanguageCode;
	logLevel: LogLevel;
	name: string;
	port: number;
}

// the subset of valdi's file_system this needs, so the store can be tested without the native module
export interface ConfigFiles {
	createDirectorySync(path: string, createIntermediates: boolean): boolean;
	readFileSync(path: string, options?: { encoding?: 'utf8' }): string | ArrayBuffer;
	writeFileSync(path: string, data: string): void;
}

export interface ConfigStore {
	path: string;
	read(): PlayerConfig | undefined;
	write(config: PlayerConfig): void;
}

export function makeConfigStore(files: ConfigFiles, path: string): ConfigStore {
	return {
		path,
		read: () => {
			let raw: string;
			try {
				raw = files.readFileSync(path, { encoding: 'utf8' }) as string;
			} catch {
				return undefined;
			}

			return parse(raw, path);
		},
		write: (config) => {
			const directory = path.substring(0, path.lastIndexOf('/'));
			if (directory !== '') {
				ensureDirectory(files, directory);
			}

			files.writeFileSync(path, `${JSON.stringify(config, null, '\t')}\n`);
		},
	};
}

export function readLanguage(value: string | undefined): LanguageCode {
	if (value === undefined) {
		return DEFAULT_LANGUAGE;
	}
	if (!isLanguageCode(value)) {
		throw CLI_ERROR.withDetail(Strings.errorUnknownLanguage(value));
	}

	return value;
}

export function readLogLevel(value: string): LogLevel {
	if (!isLogLevel(value)) {
		throw CLI_ERROR.withDetail(Strings.errorUnknownLogLevel(value));
	}

	return value;
}

export function readPort(value: string): number {
	const port = Number(value);
	if (!isPort(port)) {
		throw CLI_ERROR.withDetail(Strings.errorInvalidPort(value));
	}

	return port;
}

export function secretsDir(config: PlayerConfig): string {
	return `${config.dataDir}/secrets`;
}

export function stateDir(config: PlayerConfig): string {
	return `${config.dataDir}/state`;
}

// the native side parses it again and refuses to bind what it cannot read; this is only so a typo
// falls back to the default with the other fields rather than failing at startup
function isBindAddress(value: unknown): value is string {
	if (typeof value !== 'string') {
		return false;
	}

	const octets = value.split('.');

	return (
		octets.length === 4 && octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255)
	);
}

function isLanguageCode(value: unknown): value is LanguageCode {
	return LANGUAGE_OPTIONS.some((option) => option.code === value);
}

function isLogLevel(value: unknown): value is LogLevel {
	return LOG_LEVELS.some((level) => level === value);
}

function isPort(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65535;
}

// a file that exists but cannot be parsed is an error worth reporting; individual fields fall back,
// so hand-editing one value badly does not lock the operator out of the whole config
function parse(raw: string, path: string): PlayerConfig {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw CLI_ERROR.withDetail(Strings.errorConfigInvalid(path));
	}

	const value = parsed as {
		audioDevice?: unknown;
		bindAddress?: unknown;
		dataDir?: unknown;
		language?: unknown;
		logLevel?: unknown;
		name?: unknown;
		port?: unknown;
	};

	return {
		audioDevice:
			typeof value.audioDevice === 'string' && value.audioDevice !== ''
				? value.audioDevice
				: DEFAULT_AUDIO_DEVICE,
		bindAddress: isBindAddress(value.bindAddress) ? value.bindAddress : DEFAULT_BIND_ADDRESS,
		dataDir:
			typeof value.dataDir === 'string' && value.dataDir !== '' ? value.dataDir : DEFAULT_DATA_DIR,
		language: isLanguageCode(value.language) ? value.language : DEFAULT_LANGUAGE,
		logLevel: isLogLevel(value.logLevel) ? value.logLevel : DEFAULT_LOG_LEVEL,
		name: typeof value.name === 'string' ? value.name : '',
		port: isPort(value.port) ? value.port : DEFAULT_PORT,
	};
}
