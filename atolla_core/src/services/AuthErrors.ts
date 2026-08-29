import { type ErrorType, InternalError } from '../utils/Errors';

export const AuthErrors = {
	CONNECTION_ERROR: new InternalError('auth_connection_error'),
	FAILED_TO_FETCH_DATA: new InternalError('auth_failed_to_fetch_data'),
	LOGIN_CANCELED: new InternalError('auth_login_canceled'),
	SERVER_UNREACHABLE: new InternalError('auth_server_unreachable'),
	SESSION_EXPIRED: new InternalError('auth_session_expired'),
} as const;

export type AuthError = ErrorType<typeof AuthErrors>;
export type AuthErrorCode = AuthError['err'];
