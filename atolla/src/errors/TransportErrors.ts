import { ErrorConst } from './Const';

export const TransportErrors = {
	LIVE_NOT_IMPLEMENTED: new ErrorConst(
		'transport_live_not_implemented',
		'live transport not yet implemented',
	),
	OFFLINE_NOT_IMPLEMENTED: new ErrorConst(
		'transport_offline_not_implemented',
		'offline transport not yet implemented',
	),
} as const;
