import Strings from 'atolla_core/src/Strings';
import { UserError } from 'atolla_core/src/utils/Errors';

export const JellyfinAuthErrors = {
	NOT_A_JELLYFIN_SERVER: new UserError('auth_not_a_jellyfin_server', Strings.errorsAuthNotJellyfin),
	QUICK_CONNECT_NOT_AVAILABLE: new UserError(
		'auth_quick_connect_not_available',
		Strings.errorsAuthQuickConnectNotAvailable,
	),
	QUICK_CONNECT_TIMED_OUT: new UserError(
		'auth_quick_connect_timed_out',
		Strings.errorsAuthQuickConnectTimedOut,
	),
} as const;
