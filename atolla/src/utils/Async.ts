import { DebugLogger } from '../services/DebugLogger';

/**
 * Attach a logging `.catch()` to a detached ("fire and forget") promise so an
 * async rejection can never escape as an unhandled rejection. Unhandled
 * rejections tear down the whole app on RN-style runtimes, so any promise we
 * deliberately do not await must go through here instead of a bare `void`.
 *
 * The rejection is logged via {@link DebugLogger} (best effort) and swallowed.
 */
export function fireAndForget(label: string, promise: Promise<unknown>): void {
	void promise.catch((error: unknown) => {
		DebugLogger.log('fireAndForget', label, {
			message: error instanceof Error ? error.message : String(error),
		});
	});
}

/**
 * Run an async resolver, retrying on rejection with a short fixed backoff. Used
 * when resolving offline assets (e.g. artist logo/image URLs) so a transient
 * network failure does not permanently leave the value missing — which would
 * make it impossible to download for offline use.
 *
 * After the final attempt fails the last error is rethrown, so callers keep their
 * own fallback (e.g. `.catch(() => null)`).
 */
export async function retryResolve<T>(
	resolver: () => Promise<T>,
	options: { attempts?: number; delayMs?: number } = {},
): Promise<T> {
	const attempts = Math.max(1, options.attempts ?? 3);
	const delayMs = options.delayMs ?? 300;

	let lastError: unknown;
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		try {
			return await resolver();
		} catch (error) {
			lastError = error;
			if (attempt < attempts - 1) {
				await new Promise((resolve) => setTimeout(resolve, delayMs));
			}
		}
	}
	throw lastError;
}
