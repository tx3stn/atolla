import Strings from '../Strings';
import { type ErrorType, UserError } from '../utils/Errors';

export const PlaybackErrors = {
	NETWORK: new UserError('playback_network', Strings.errorsPlaybackNetwork),
	UNKNOWN: new UserError('playback_unknown', Strings.errorsPlaybackUnknown),
	UNSUPPORTED_FORMAT: new UserError(
		'playback_unsupported_format',
		Strings.errorsPlaybackUnsupportedFormat,
	),
} as const;

export type PlaybackError = ErrorType<typeof PlaybackErrors>;
