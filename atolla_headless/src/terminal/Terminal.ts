import { channels } from './Gradient';

declare const process: { stdout: { write(text: string): boolean } };

export interface Terminal {
	colour(text: string, hex: string): string;
	dim(text: string): string;
	write(line: string): void;
}

export type Writer = (text: string) => void;

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

export const stdout: Writer = (text) => {
	process.stdout.write(text);
};

export function makeTerminal(write: Writer, colour: boolean): Terminal {
	return {
		colour: colour
			? (text, hex) => `\x1b[38;2;${channels(hex).join(';')}m${text}${RESET}`
			: (text) => text,
		dim: colour ? (text) => `${DIM}${text}${RESET}` : (text) => text,
		write: (line) => {
			write(`${line}\n`);
		},
	};
}
