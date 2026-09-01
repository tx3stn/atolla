import Strings from 'atolla_headless/src/Strings';
import { makeFileKeyValueStore } from '../FileKeyValueStore';
import { formatCode, loadPairing, resetPairing } from '../Pairing';
import { secretsDir } from '../PlayerConfig';
import type { Cmd, CommandContext } from './Command';
import { CLI_ERROR } from './Errors';
import { FLAG_RESET } from './Flags';

export const CmdPair = {
	flags: {
		[FLAG_RESET]: { describe: Strings.flagPairReset, kind: 'boolean' },
	},
	helpTextLong: Strings.pairHelpLong,
	helpTextShort: Strings.pairHelpShort,
	run: async ({ args, config, files, randomBytes, terminal }: CommandContext): Promise<number> => {
		const current = config.read();
		if (current === undefined) {
			throw CLI_ERROR.withDetail(Strings.errorConfigMissing(config.path));
		}

		const secrets = makeFileKeyValueStore(files, secretsDir(current));
		const reset = args.flag(FLAG_RESET);
		const pairing = reset
			? await resetPairing(secrets, randomBytes)
			: await loadPairing(secrets, randomBytes);

		if (reset) {
			terminal.write(terminal.warning(Strings.pairingReset()));
		}

		terminal.write(terminal.dim(Strings.pairingInstructions()));
		terminal.write(`code: ${formatCode(pairing.code)}`);

		return 0;
	},
} satisfies Cmd;
