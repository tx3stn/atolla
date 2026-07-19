import { ErrorConst, type ErrorType, toErrorConst } from '../utils/Errors';

export const AuthErrors = {
	CONNECTION_ERROR: new ErrorConst('auth_connection_error', 'connection error'),
	FAILED_TO_FETCH_DATA: new ErrorConst('auth_failed_to_fetch_data', 'failed to fetch data'),
	LOGIN_CANCELED: new ErrorConst('auth_login_canceled', 'login canceled'),
	NOT_A_JELLYFIN_SERVER: new ErrorConst('auth_not_a_jellyfin_server', 'not a jellyfin server'),
	QUICK_CONNECT_NOT_AVAILABLE: new ErrorConst(
		'auth_quick_connect_not_available',
		'quick connect not available',
	),
	QUICK_CONNECT_TIMED_OUT: new ErrorConst(
		'auth_quick_connect_timed_out',
		'quick connect timed out',
	),
	SERVER_UNREACHABLE: new ErrorConst('auth_server_unreachable', "can't reach server"),
	SESSION_EXPIRED: new ErrorConst('auth_session_expired', 'session expired'),
} as const;

export type AuthError = ErrorType<typeof AuthErrors>;

export function toAuthError(cause: unknown): AuthError {
	return toErrorConst<AuthError>(cause, AuthErrors.CONNECTION_ERROR);
}
