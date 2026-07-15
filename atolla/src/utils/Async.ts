import { getLogger } from '../services/Logger';

const log = getLogger('fireAndForget');

// attach a logging .catch() to a detached promise so an async rejection can't escape
// as an unhandled rejection (those tear down the whole app on RN-style runtimes). any
// promise we deliberately don't await should go through here instead of a bare void
export function fireAndForget(label: string, promise: Promise<unknown>): void {
	void promise.catch((error: unknown) => {
		log.warn(label, {
			message: error instanceof Error ? error.message : String(error),
		});
	});
}

// run an async resolver, retrying on rejection with a short fixed backoff. used when
// resolving offline assets (e.g. artist image URLs) so a transient network failure
// doesn't permanently leave the value missing. rethrows the last error after the final
// attempt, so callers keep their own fallback
export async function retryResolve<T>(
	resolver: () => PromiseLike<T>,
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
