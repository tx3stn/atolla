import type { Terminal } from './Terminal';

export interface Field {
	label: string;
	value: string;
}

const GUTTER = '    ';

export function beside(
	left: Array<string>,
	leftWidth: number,
	right: Array<string>,
): Array<string> {
	const lines: Array<string> = [];
	for (let i = 0; i < Math.max(left.length, right.length); i++) {
		const leftCell = i < left.length ? left[i] : ' '.repeat(leftWidth);
		const rightCell = i < right.length ? right[i] : '';
		lines.push(`${leftCell}${GUTTER}${rightCell}`.replace(/\s+$/, ''));
	}
	return lines;
}

export function fields(terminal: Terminal, entries: Array<Field>): Array<string> {
	const width = entries.reduce((widest, entry) => Math.max(widest, entry.label.length), 0);
	return entries.map(
		(entry) => `${terminal.dim(entry.label.padEnd(width))} ${terminal.dim(':')} ${entry.value}`,
	);
}
