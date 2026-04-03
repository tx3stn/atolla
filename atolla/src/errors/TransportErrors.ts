import { ErrorConst } from './Const';

export const TransportErrors = {
	LIVE_INVALID_RESPONSE: new ErrorConst(
		'transport_live_invalid_response',
		'live transport returned invalid response',
	),
	LIVE_NOT_IMPLEMENTED: new ErrorConst(
		'transport_live_not_implemented',
		'live transport not yet implemented',
	),
	LIVE_REQUEST_FAILED: new ErrorConst(
		'transport_live_request_failed',
		'live transport request failed',
	),
	OFFLINE_NOT_IMPLEMENTED: new ErrorConst(
		'transport_offline_not_implemented',
		'offline transport not yet implemented',
	),
} as const;
