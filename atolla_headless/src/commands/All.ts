import type { Cmd } from './Command';
import { CmdConfig } from './Config';
import { CmdInit } from './Init';
import { CmdOutputs } from './Outputs';
import { CmdPair } from './Pair';
import { CmdRun } from './Run';

export const AllCmds = {
	config: CmdConfig,
	init: CmdInit,
	outputs: CmdOutputs,
	pair: CmdPair,
	run: CmdRun,
} satisfies Record<string, Cmd>;
