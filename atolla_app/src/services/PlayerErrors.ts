import { type ErrorType, InternalError } from 'atolla_core/src/utils/Errors';

export const PlayerErrors = {
	INVALID_ADDRESS: new InternalError('invalid_address'),
	INVALID_PAIRING_CODE: new InternalError('invalid_pairing_code'),
	NOT_AN_ATOLLA_PLAYER: new InternalError('not_an_atolla_player'),
	NOT_THE_PAIRED_PLAYER: new InternalError('not_the_paired_player'),
	PLAYER_TIMED_OUT: new InternalError('player_timed_out'),
	PLAYER_UNREACHABLE: new InternalError('player_unreachable'),
} as const;

export type PlayerError = ErrorType<typeof PlayerErrors>;
export type PlayerErrorCode = PlayerError['err'];
