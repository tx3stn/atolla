import { type ErrorType, InternalError } from 'atolla_core/src/utils/Errors';

export const IntegrationErrors = {
	REQUEST_FAILED: new InternalError('integration_request_failed'),
	TIMED_OUT: new InternalError('integration_timed_out'),
	UNAUTHORIZED: new InternalError('integration_unauthorized'),
	UNREACHABLE: new InternalError('integration_unreachable'),
	WRONG_SERVICE: new InternalError('integration_wrong_service'),
} as const;

export type IntegrationError = ErrorType<typeof IntegrationErrors>;
export type IntegrationErrorCode = IntegrationError['err'];
