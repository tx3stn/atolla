import { InternalError } from 'atolla_core/src/utils/Errors';

export const CLI_ERROR = new InternalError('cli');
export const USAGE_ERROR = new InternalError('usage');
