import { ErrorConst } from './Const';

export const AuthErrors = {
	CONNECTION_ERROR: new ErrorConst('auth_connection_error', 'connection error'),
	FAILED_TO_FETCH_DATA: new ErrorConst('auth_failed_to_fetch_data', 'failed to fetch data'),
	QUICK_CONNECT_NOT_AVAILABLE: new ErrorConst(
		'auth_quick_connect_not_available',
		'quick connect not available',
	),
	QUICK_CONNECT_TIMED_OUT: new ErrorConst(
		'auth_quick_connect_timed_out',
		'quick connect timed out',
	),
	SESSION_EXPIRED: new ErrorConst('auth_session_expired', 'session expired'),
} as const;
