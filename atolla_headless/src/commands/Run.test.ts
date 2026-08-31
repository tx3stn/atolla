import { describe, expect, it } from 'bun:test';
import { isErrorConst } from 'atolla_core/src/utils/Errors';
import type { ConfigStore } from '../PlayerConfig';
import { makeTerminal } from '../terminal/Terminal';
import { parseArguments } from './Arguments';
import { CLI_ERROR } from './Errors';
import { CmdRun } from './Run';

const PATH = '/etc/atolla/player.json';

function context(read: ConfigStore['read']) {
	return {
		args: parseArguments([], CmdRun.flags),
		config: { path: PATH, read, write: () => {} },
		files: { readFileSync: () => '', writeFileSync: () => {} },
		setLanguage: () => {},
		terminal: makeTerminal(() => {}, false),
	};
}

describe('CmdRun', () => {
	it('rejects naming the config path when no config exists', async () => {
		try {
			await CmdRun.run(context(() => undefined));
		} catch (error) {
			expect(isErrorConst(error) && error.err === CLI_ERROR.err).toBe(true);
			expect(isErrorConst(error) && error.detail).toContain(PATH);
			return;
		}

		throw new Error('expected a cli error');
	});
});
