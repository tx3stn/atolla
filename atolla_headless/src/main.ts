import { DEFAULT_LANGUAGE, type LanguageCode } from 'atolla_core/src/Language';
import { applyLanguage } from 'atolla_core/src/Localization';
import { isErrorConst } from 'atolla_core/src/utils/Errors';
import { version } from 'atolla_core/src/version';
import Strings from 'atolla_headless/src/Strings';
import { fs } from 'file_system/src/FileSystem';
import { beginKeepAlive, endKeepAlive } from 'valdi_core/src/utils/KeepAliveCallback';
import { AllCmds } from './commands/All';
import { parseArguments } from './commands/Arguments';
import type { Cmd, Runnable } from './commands/Command';
import { USAGE_ERROR } from './commands/Errors';
import { FLAG_CONFIG, FLAG_HELP, FLAG_NO_COLOR, FLAG_VERSION, RootFlags } from './commands/Flags';
import { commandHelp, help } from './commands/Help';
import { type ConfigStore, DEFAULT_CONFIG_PATH, makeConfigStore } from './PlayerConfig';
import { makeTerminal, stdout, type Terminal } from './terminal/Terminal';

// Importing valdi_standalone/src/ValdiStandalone pulls the whole renderer into the program, and
// valdi_core/src/utils/Buffer.ts does not typecheck under TypeScript 7, so declare the two members
// of the global this CLI actually uses.
declare const valdiStandalone: { arguments: Array<string>; exit(code: number): void };

interface Invocation {
	colour: boolean;
	command: string | undefined;
	commandArgs: Array<string>;
	configPath: string;
}

const CmdRoot: Runnable = {
	flags: RootFlags,
	run: async ({ args, terminal }) => {
		if (args.flag(FLAG_VERSION)) {
			terminal.write(`${version}`);
			return 0;
		}

		return help(terminal);
	},
};

// unlike the app, the CLI overrides even for the default: without it the resolver falls through to
// the system locale, which would reintroduce the detection the config file replaces
function configuredLanguage(config: ConfigStore): LanguageCode {
	try {
		return config.read()?.language ?? DEFAULT_LANGUAGE;
	} catch {
		return DEFAULT_LANGUAGE;
	}
}

function fail(terminal: Terminal, command: string | undefined, message: string): number {
	terminal.write(prefixed(command, message));
	terminal.write('');
	help(terminal);
	return 1;
}

function setLanguage(language: LanguageCode): void {
	applyLanguage(language, Strings);
}

function prefixed(command: string | undefined, message: string): string {
	return command === undefined ? `atolla: ${message}` : `atolla ${command}: ${message}`;
}

function report(terminal: Terminal, command: string | undefined, error: unknown): number {
	if (isErrorConst(error)) {
		if (error.err === USAGE_ERROR.err) {
			return fail(terminal, command, error.detail);
		}

		terminal.write(prefixed(command, error.detail));
		return 1;
	}

	terminal.write(prefixed(command, error instanceof Error ? error.message : String(error)));
	return 1;
}

async function runCommand(
	terminal: Terminal,
	config: ConfigStore,
	command: string,
	commandArgs: Array<string>,
): Promise<number> {
	const cmd: Cmd | undefined = (AllCmds as Record<string, Cmd>)[command];

	if (cmd === undefined) {
		return fail(terminal, command, Strings.unknownCommand());
	}

	if (commandArgs.includes(FLAG_HELP)) {
		return commandHelp(terminal, command, cmd);
	}

	return cmd.run({
		args: parseArguments(commandArgs, cmd.flags),
		config,
		files: fs,
		setLanguage,
		terminal,
	});
}

// --config and --no-color are consumed here rather than declared per command, because they apply to
// the whole invocation: the config file supplies the language every other message is rendered in
function parseInvocation(argv: Array<string>): Invocation {
	const rest: Array<string> = [];
	let colour = true;
	let configPath = DEFAULT_CONFIG_PATH;

	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];

		if (arg === FLAG_NO_COLOR) {
			colour = false;
			continue;
		}

		if (arg === FLAG_CONFIG) {
			index++;
			if (index >= argv.length) {
				throw USAGE_ERROR.withDetail(Strings.errorMissingValue(FLAG_CONFIG));
			}
			configPath = argv[index];
			continue;
		}

		rest.push(arg);
	}

	const named = rest.length > 0 && !rest[0].startsWith('--');

	return {
		colour,
		command: named ? rest[0] : undefined,
		commandArgs: named ? rest.slice(1) : rest,
		configPath,
	};
}

function main(): void {
	const argv = valdiStandalone.arguments.slice(1);
	const terminal = makeTerminal(stdout, !argv.includes(FLAG_NO_COLOR));

	applyLanguage(DEFAULT_LANGUAGE, Strings);

	let command: string | undefined;

	const dispatch = async (): Promise<number> => {
		const invocation = parseInvocation(argv);
		command = invocation.command;

		const config = makeConfigStore(fs, invocation.configPath);
		applyLanguage(configuredLanguage(config), Strings);

		return command === undefined
			? CmdRoot.run({
					args: parseArguments(invocation.commandArgs, CmdRoot.flags),
					config,
					files: fs,
					setLanguage,
					terminal,
				})
			: runCommand(terminal, config, command, invocation.commandArgs);
	};

	const keepAlive = beginKeepAlive();
	dispatch().then(
		(exitCode) => {
			endKeepAlive(keepAlive);
			valdiStandalone.exit(exitCode);
		},
		(error) => {
			endKeepAlive(keepAlive);
			valdiStandalone.exit(report(terminal, command, error));
		},
	);
}

main();
