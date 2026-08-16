import Strings from 'atolla_core/src/Strings';
import { UserError } from '../utils/Errors';

export const AuthErrors = {
	CONNECTION_ERROR: new UserError('auth_connection_error', Strings.errorsAuthConnection),
	FAILED_TO_FETCH_DATA: new UserError('auth_failed_to_fetch_data', Strings.errorsAuthFailedToFetch),
	LOGIN_CANCELED: new UserError('auth_login_canceled', Strings.errorsAuthLoginCanceled),
	SERVER_UNREACHABLE: new UserError('auth_server_unreachable', Strings.errorsAuthServerUnreachable),
	SESSION_EXPIRED: new UserError('auth_session_expired', Strings.errorsAuthSessionExpired),
} as const;

export type AuthError = UserError<string>;
