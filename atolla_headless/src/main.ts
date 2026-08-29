import { version } from 'atolla_core/src/version';
import { ArgumentsParser } from 'valdi_standalone/src/ArgumentsParser';
import { AllCmds } from './commands/All';
import type { Cmd } from './commands/Command';
import { FLAG_HELP, FLAG_NO_COLOR, FLAG_VERSION } from './commands/Flags';
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

const DEFAULT_COMMAND = 'run';

function acceptsNoOptions(
	terminal: Terminal,
	command: string,
	commandArgs: Array<string>,
): boolean {
	// ArgumentsParser drops the first element of the array it is given, so re-head it with a dummy.
	const parser = new ArgumentsParser(`atolla ${command}`, ['_', ...commandArgs]);

	try {
		parser.parse();
		return true;
	} catch (error) {
		fail(terminal, command, error instanceof Error ? error.message : String(error));
		return false;
	}
}

function dispatch(terminal: Terminal, invocation: Invocation): number {
	const { command, commandArgs } = invocation;

	if (command === undefined) {
		if (commandArgs.includes(FLAG_HELP)) {
			return help(terminal);
		}

		if (commandArgs.includes(FLAG_VERSION)) {
			terminal.write(`atolla ${version}`);
			return 0;
		}

		return runCommand(terminal, DEFAULT_COMMAND, commandArgs);
	}

	return runCommand(terminal, command, commandArgs);
}

function fail(terminal: Terminal, command: string, message: string): number {
	terminal.write(`atolla ${command}: ${message}`);
	terminal.write('');
	help(terminal);
	return 1;
}

function runCommand(terminal: Terminal, command: string, commandArgs: Array<string>): number {
	const cmd: Cmd | undefined = (AllCmds as Record<string, Cmd>)[command];
	if (cmd === undefined) {
		return fail(terminal, command, 'unknown command');
	}

	if (commandArgs.includes(FLAG_HELP)) {
		return commandHelp(terminal, command, cmd);
	}

	if (!acceptsNoOptions(terminal, command, commandArgs)) {
		return 1;
	}

	return cmd.action(terminal);
}

function main(): void {
	const invocation = parseArguments(valdiStandalone.arguments.slice(1));
	const terminal = makeTerminal(stdout, invocation.colour);

	let exitCode: number;
	try {
		exitCode = dispatch(terminal, invocation);
	} catch (error) {
		terminal.write(`atolla: ${error instanceof Error ? error.message : String(error)}`);
		exitCode = 1;
	}

	valdiStandalone.exit(exitCode);
}

// --no-color is consumed here rather than registered per command, because ArgumentsParser throws on
// any token the command did not declare.
function parseArguments(argv: Array<string>): Invocation {
	const args = argv.filter((arg) => arg !== FLAG_NO_COLOR);
	const named = args.length > 0 && !args[0].startsWith('--');

	return {
		colour: !argv.includes(FLAG_NO_COLOR),
		command: named ? args[0] : undefined,
		commandArgs: named ? args.slice(1) : args,
	};
}

main();
