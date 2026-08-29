import type { Cmd } from './Command';
import { CmdPair } from './Pair';
import { CmdRun } from './Run';

export const AllCmds = {
	pair: CmdPair,
	run: CmdRun,
} satisfies Record<string, Cmd>;
