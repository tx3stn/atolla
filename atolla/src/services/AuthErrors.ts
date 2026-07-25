import Strings from '../Strings';
import { type ErrorType, UserError } from '../utils/Errors';

export const AuthErrors = {
	CONNECTION_ERROR: new UserError('auth_connection_error', Strings.errorsAuthConnection),
	FAILED_TO_FETCH_DATA: new UserError('auth_failed_to_fetch_data', Strings.errorsAuthFailedToFetch),
	LOGIN_CANCELED: new UserError('auth_login_canceled', Strings.errorsAuthLoginCanceled),
	NOT_A_JELLYFIN_SERVER: new UserError('auth_not_a_jellyfin_server', Strings.errorsAuthNotJellyfin),
	QUICK_CONNECT_NOT_AVAILABLE: new UserError(
		'auth_quick_connect_not_available',
		Strings.errorsAuthQuickConnectNotAvailable,
	),
	QUICK_CONNECT_TIMED_OUT: new UserError(
		'auth_quick_connect_timed_out',
		Strings.errorsAuthQuickConnectTimedOut,
	),
	SERVER_UNREACHABLE: new UserError('auth_server_unreachable', Strings.errorsAuthServerUnreachable),
	SESSION_EXPIRED: new UserError('auth_session_expired', Strings.errorsAuthSessionExpired),
} as const;

export type AuthError = ErrorType<typeof AuthErrors>;
