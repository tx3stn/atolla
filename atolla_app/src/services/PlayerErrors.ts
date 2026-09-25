import { type ErrorType, InternalError } from 'atolla_core/src/utils/Errors';

export const PlayerErrors = {
	INVALID_PAIRING_CODE: new InternalError('invalid_pairing_code'),
	PLAYER_TIMED_OUT: new InternalError('player_timed_out'),
} as const;

export type PlayerError = ErrorType<typeof PlayerErrors>;
export type PlayerErrorCode = PlayerError['err'];
