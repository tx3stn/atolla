import { DEFAULT_LANGUAGE, LANGUAGE_OPTIONS, type LanguageCode } from 'atolla_core/src/Language';
import Strings from 'atolla_headless/src/Strings';
import { CLI_ERROR } from './commands/Errors';

export const DEFAULT_CONFIG_PATH = '/etc/atolla/player.json';
export const DEFAULT_DATA_DIR = '/var/lib/atolla';

export interface PlayerConfig {
	dataDir: string;
	language: LanguageCode;
	name: string;
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

export function isLanguageCode(value: unknown): value is LanguageCode {
	return LANGUAGE_OPTIONS.some((option) => option.code === value);
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
				try {
					files.createDirectorySync(directory, true);
				} catch {
					// already present
				}
			}

			files.writeFileSync(path, `${JSON.stringify(config, null, '\t')}\n`);
		},
	};
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

	const value = parsed as { dataDir?: unknown; language?: unknown; name?: unknown };

	return {
		dataDir:
			typeof value.dataDir === 'string' && value.dataDir !== '' ? value.dataDir : DEFAULT_DATA_DIR,
		language: isLanguageCode(value.language) ? value.language : DEFAULT_LANGUAGE,
		name: typeof value.name === 'string' ? value.name : '',
	};
}
