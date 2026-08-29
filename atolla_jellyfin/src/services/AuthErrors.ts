import { type ErrorType, InternalError } from 'atolla_core/src/utils/Errors';

export const JellyfinAuthErrors = {
	NOT_A_JELLYFIN_SERVER: new InternalError('auth_not_a_jellyfin_server'),
	QUICK_CONNECT_NOT_AVAILABLE: new InternalError('auth_quick_connect_not_available'),
	QUICK_CONNECT_TIMED_OUT: new InternalError('auth_quick_connect_timed_out'),
} as const;

export type JellyfinAuthError = ErrorType<typeof JellyfinAuthErrors>;
export type JellyfinAuthErrorCode = JellyfinAuthError['err'];
