export type DeferredDownloadPurpose = 'current' | 'prefetch' | 'palette';

export interface DeferredDownloadRecord {
	requestId: number;
	run: () => void;
	source: string;
	trackId: string;
}

export interface PlaybackStartedSignal {
	currentRequestId: number;
	currentTrackId: string | null;
	source: string | null;
}

interface PendingEntry extends DeferredDownloadRecord {
	timeoutId: ReturnType<typeof setTimeout> | null;
}

// backstop: if a streamed track buffers but never reports it started playing, run
// the deferred work anyway so it still gets cached/prefetched instead of stranded
const DEFAULT_SAFETY_TIMEOUT_MS = 7000;

// holds the cache/prefetch downloads that would otherwise fire as a streamed track
// begins, releasing them only once it has actually started playing so the initial
// buffer stays uncontended. the (source, requestId, trackId) triple guards against a
// superseded track triggering a stale download
export class DeferredPlaybackDownloadCoordinator {
	private readonly pending = new Map<DeferredDownloadPurpose, PendingEntry>();

	constructor(private readonly safetyTimeoutMs: number = DEFAULT_SAFETY_TIMEOUT_MS) {}

	defer(purpose: DeferredDownloadPurpose, record: DeferredDownloadRecord): void {
		this.clearTimer(purpose);
		const timeoutId =
			this.safetyTimeoutMs > 0 ? setTimeout(() => this.fire(purpose), this.safetyTimeoutMs) : null;
		this.pending.set(purpose, { ...record, timeoutId });
	}

	onPlaybackStarted(signal: PlaybackStartedSignal): void {
		if (!signal.source) {
			return;
		}

		for (const [purpose, entry] of [...this.pending]) {
			if (
				entry.source === signal.source &&
				entry.requestId === signal.currentRequestId &&
				entry.trackId === signal.currentTrackId
			) {
				this.fire(purpose);
			}
		}
	}

	cancel(purpose: DeferredDownloadPurpose): void {
		this.clearTimer(purpose);
		this.pending.delete(purpose);
	}

	reset(): void {
		for (const purpose of [...this.pending.keys()]) {
			this.clearTimer(purpose);
		}
		this.pending.clear();
	}

	private fire(purpose: DeferredDownloadPurpose): void {
		const entry = this.pending.get(purpose);
		if (!entry) {
			return;
		}

		this.clearTimer(purpose);
		this.pending.delete(purpose);
		entry.run();
	}

	private clearTimer(purpose: DeferredDownloadPurpose): void {
		const entry = this.pending.get(purpose);
		if (entry?.timeoutId != null) {
			clearTimeout(entry.timeoutId);
			entry.timeoutId = null;
		}
	}
}
