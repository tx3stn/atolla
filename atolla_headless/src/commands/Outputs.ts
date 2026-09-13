import Strings from 'atolla_headless/src/Strings';
import { DEFAULT_AUDIO_DEVICE, SILENT_AUDIO_DEVICE } from '../PlayerConfig';
import type { Cmd, CommandContext } from './Command';

export const CmdOutputs = {
	flags: {},
	helpTextLong: Strings.outputsHelpLong,
	helpTextShort: Strings.outputsHelpShort,
	run: async ({ audioDevices, terminal }: CommandContext): Promise<number> => {
		terminal.write(DEFAULT_AUDIO_DEVICE);
		terminal.write(SILENT_AUDIO_DEVICE);

		for (const device of audioDevices()) {
			terminal.write(device);
		}

		return 0;
	},
} satisfies Cmd;
