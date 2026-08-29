import type { Cmd } from './Command';
import { CmdConfig } from './Config';
import { CmdInit } from './Init';
import { CmdPair } from './Pair';
import { CmdRun } from './Run';

export const AllCmds = {
	config: CmdConfig,
	init: CmdInit,
	pair: CmdPair,
	run: CmdRun,
} satisfies Record<string, Cmd>;
