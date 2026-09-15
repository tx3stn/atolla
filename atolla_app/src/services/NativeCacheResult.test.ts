import { describe, expect, it } from 'bun:test';
import { isUnauthorizedCacheError, NATIVE_CACHE_UNAUTHORIZED } from './NativeCacheResult';

describe('isUnauthorizedCacheError', () => {
	it('recognises the rejection the download worker raises', () => {
		expect(isUnauthorizedCacheError(new Error(NATIVE_CACHE_UNAUTHORIZED))).toBe(true);
	});

	it('survives the worker boundary, which rebuilds the error from its message alone', () => {
		const crossed = new Error(new Error(NATIVE_CACHE_UNAUTHORIZED).message);
		expect(isUnauthorizedCacheError(crossed)).toBe(true);
	});

	it('leaves an ordinary download failure alone', () => {
		expect(
			isUnauthorizedCacheError(
				new Error('cacheAtollaDownloadedTrackFromUrlAsync returned no source'),
			),
		).toBe(false);
	});

	it('is not fooled by a bare string that happens to match', () => {
		expect(isUnauthorizedCacheError(NATIVE_CACHE_UNAUTHORIZED)).toBe(false);
	});

	it('handles a rejection that is not an error at all', () => {
		expect(isUnauthorizedCacheError(null)).toBe(false);
		expect(isUnauthorizedCacheError(undefined)).toBe(false);
	});
});
