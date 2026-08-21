import { InternalError } from '../utils/Errors';

export const TransportErrors = {
	LIVE_INVALID_RESPONSE: new InternalError('transport_live_invalid_response'),
	LIVE_NOT_FOUND: new InternalError('transport_live_not_found'),
	LIVE_REQUEST_FAILED: new InternalError('transport_live_request_failed'),
	OFFLINE_SCROBBLE: new InternalError('transport_offline_scrobble'),
} as const;
