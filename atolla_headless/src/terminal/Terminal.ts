import { channels } from './Gradient';

declare const process: { stdout: { write(text: string): boolean } };

export interface Terminal {
	colour(text: string, hex: string): string;
	dim(text: string): string;
	warning(text: string): string;
	write(line: string): void;
}

export type Writer = (text: string) => void;

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
// amber rather than a bright yellow, so it stays legible on light and dark terminals alike
const WARNING = '#D79921';

export const stdout: Writer = (text) => {
	process.stdout.write(text);
};

export function makeTerminal(write: Writer, colour: boolean): Terminal {
	const paint = colour
		? (text: string, hex: string) => `\x1b[38;2;${channels(hex).join(';')}m${text}${RESET}`
		: (text: string) => text;

	return {
		colour: paint,
		dim: colour ? (text) => `${DIM}${text}${RESET}` : (text) => text,
		warning: (text) => paint(text, WARNING),
		write: (line) => {
			write(`${line}\n`);
		},
	};
}
