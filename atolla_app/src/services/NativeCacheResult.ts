export const NATIVE_CACHE_UNAUTHORIZED = 'atolla:unauthorized';

export function isUnauthorizedCacheError(error: unknown): boolean {
	return error instanceof Error && error.message === NATIVE_CACHE_UNAUTHORIZED;
}
