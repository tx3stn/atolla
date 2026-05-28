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
