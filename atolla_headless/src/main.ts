import { version } from 'atolla_core/src/version';
import { ArgumentsParser } from 'valdi_standalone/src/ArgumentsParser';
import { AllCmds, type Cmd, help } from './commands/All';
import { makeTerminal, stdout } from './terminal/Terminal';

// Importing valdi_standalone/src/ValdiStandalone pulls the whole renderer into the program, and
// valdi_core/src/utils/Buffer.ts does not typecheck under TypeScript 7, so declare the two members
// of the global this CLI actually uses.
declare const valdiStandalone: { arguments: Array<string>; exit(code: number): void };

const NO_COLOR = '--no-color';

const argv = valdiStandalone.arguments.slice(1);
const terminal = makeTerminal(stdout, !argv.includes(NO_COLOR));
const args = argv.filter((arg) => arg !== NO_COLOR);

function parserFor(command: string, commandArgs: Array<string>): ArgumentsParser {
	return new ArgumentsParser(`atolla ${command}`, ['_', ...commandArgs]);
}

function takesNoOptions(command: string, commandArgs: Array<string>): boolean {
	return report(parserFor(command, commandArgs), command);
}

function fail(command: string, message: string): number {
	terminal.write(`atolla ${command}: ${message}`);
	terminal.write('');
	help(terminal);
	return 1;
}

function report(parser: ArgumentsParser, command: string): boolean {
	try {
		parser.parse();
		return true;
	} catch (error) {
		fail(command, error instanceof Error ? error.message : String(error));
		return false;
	}
}

function dispatch(): number | undefined {
	if (args.includes('--help') || args[0] === 'help') {
		help(terminal);
		return 0;
	}

	if (args.includes('--version')) {
		terminal.write(`atolla ${version}`);
		return 0;
	}

	const commandName = args.length > 0 && !args[0].startsWith('--') ? args[0] : 'run';
	const commandArgs = commandName === args[0] ? args.slice(1) : args;

	const command: Cmd | undefined = (AllCmds as Record<string, Cmd>)[commandName];
	if (command === undefined) {
		return fail(commandName, 'unknown command');
	}

	if (!takesNoOptions(commandName, commandArgs)) {
		return 1;
	}

	return command.action(terminal);
}

let exitCode: number | undefined;
try {
	exitCode = dispatch();
} catch (error) {
	terminal.write(`atolla: ${error instanceof Error ? error.message : String(error)}`);
	exitCode = 1;
}

if (exitCode !== undefined) {
	valdiStandalone.exit(exitCode);
}
