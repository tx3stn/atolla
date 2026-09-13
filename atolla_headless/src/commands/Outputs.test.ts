import { describe, expect, it } from 'bun:test';
import type { AudioDevices } from '../Audio';
import { makeTerminal } from '../terminal/Terminal';
import { parseArguments } from './Arguments';
import type { CommandContext } from './Command';
import { CmdOutputs } from './Outputs';

async function listed(audioDevices: AudioDevices): Promise<Array<string>> {
	const lines: Array<string> = [];

	await CmdOutputs.run({
		args: parseArguments([], CmdOutputs.flags),
		audioDevices,
		terminal: makeTerminal((text) => lines.push(text.replace(/\n$/, '')), false),
	} as CommandContext);

	return lines;
}

describe('CmdOutputs', () => {
	it('lists what the machine offers under the two values that always work', async () => {
		expect(await listed(() => ['Built-in Output', 'USB Audio DAC'])).toEqual([
			'default',
			'none',
			'Built-in Output',
			'USB Audio DAC',
		]);
	});

	it('still offers both values on hardware with no output at all', async () => {
		expect(await listed(() => [])).toEqual(['default', 'none']);
	});
});
