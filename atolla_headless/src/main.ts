import { applyLanguage, DEFAULT_LANGUAGE } from 'atolla_core/src/Language';
import { isErrorConst } from 'atolla_core/src/utils/Errors';
import { version } from 'atolla_core/src/version';
import Strings from 'atolla_headless/src/Strings';
import { AllCmds } from './commands/All';
import { parseArguments, USAGE_ERROR } from './commands/Arguments';
import type { Cmd, Runnable } from './commands/Command';
import { FLAG_HELP, FLAG_NO_COLOR, FLAG_VERSION, RootFlags } from './commands/Flags';
import { commandHelp, help } from './commands/Help';
import { makeTerminal, stdout, type Terminal } from './terminal/Terminal';

// Importing valdi_standalone/src/ValdiStandalone pulls the whole renderer into the program, and
// valdi_core/src/utils/Buffer.ts does not typecheck under TypeScript 7, so declare the two members
// of the global this CLI actually uses.
declare const valdiStandalone: { arguments: Array<string>; exit(code: number): void };

interface Invocation {
	colour: boolean;
	command: string | undefined;
	commandArgs: Array<string>;
}

const CmdRoot: Runnable = {
	flags: RootFlags,
	run: (terminal, args) => {
		if (args.flag(FLAG_VERSION)) {
			terminal.write(`${version}`);
			return 0;
		}

		return help(terminal);
	},
};

function fail(terminal: Terminal, command: string | undefined, message: string): number {
	terminal.write(command === undefined ? `atolla: ${message}` : `atolla ${command}: ${message}`);
	terminal.write('');
	help(terminal);
	return 1;
}

function runCommand(terminal: Terminal, command: string, commandArgs: Array<string>): number {
	const cmd: Cmd | undefined = (AllCmds as Record<string, Cmd>)[command];

	if (cmd === undefined) {
		return fail(terminal, command, Strings.unknownCommand());
	}

	if (commandArgs.includes(FLAG_HELP)) {
		return commandHelp(terminal, cmd);
	}

	// return invoke(terminal, cmd, commandArgs);
	return cmd.run(terminal, parseArguments(commandArgs, cmd.flags));
}

function parseInvocation(argv: Array<string>): Invocation {
	const args = argv.filter((arg) => arg !== FLAG_NO_COLOR);
	const named = args.length > 0 && !args[0].startsWith('--');

	return {
		colour: !argv.includes(FLAG_NO_COLOR),
		command: named ? args[0] : undefined,
		commandArgs: named ? args.slice(1) : args,
	};
}

function main(): void {
	const { colour, command, commandArgs } = parseInvocation(valdiStandalone.arguments.slice(1));
	const terminal = makeTerminal(stdout, colour);

	applyLanguage(DEFAULT_LANGUAGE, Strings);

	let exitCode: number;
	try {
		exitCode =
			command === undefined
				? CmdRoot.run(terminal, parseArguments(commandArgs, CmdRoot.flags))
				: runCommand(terminal, command, commandArgs);
	} catch (error) {
		if (isErrorConst(error) && error.err === USAGE_ERROR.err) {
			exitCode = fail(terminal, command, error.detail);
		} else {
			terminal.write(`atolla: ${error instanceof Error ? error.message : String(error)}`);
			exitCode = 1;
		}
	}

	valdiStandalone.exit(exitCode);
}

main();
