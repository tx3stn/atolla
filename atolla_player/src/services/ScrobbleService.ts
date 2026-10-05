import { getLogger } from 'atolla_core/src/services/Logger';
import { TransportErrors } from 'atolla_core/src/transports/Errors';

export interface PendingScrobble {
	playedAtMs: number;
	trackId: string;
}

// the durable pending-scrobble queue owned by the native audio engine (survives backgrounding and
// process death). injected so the service stays unit-testable with a fake queue.
export interface NativeScrobbleQueue {
	ack(trackId: string, playedAtMs: number): void;
	read(): Array<PendingScrobble>;
}

export interface ScrobbleServiceOptions {
	deliverScrobble: (trackId: string, playedAtIso: string) => Promise<void>;
	maxAgeMs?: number;
	now?: () => number;
	queue: NativeScrobbleQueue;
}

const defaultMaxAgeMs = 30 * 24 * 60 * 60 * 1000;
const maxConsecutiveFailures = 3;

const log = getLogger('scrobble');

// delivery pump for the native scrobble queue. detection + durability live natively (the engine
// decides a track is played and persists it to disk); JS only reads the pending queue, delivers
// each entry to the server via the active transport, and acks it. offline deliveries fail and stay
// queued for the next sync.
export class ScrobbleService {
	private readonly deliverScrobble: (trackId: string, playedAtIso: string) => Promise<void>;
	private readonly queue: NativeScrobbleQueue;
	private readonly maxAgeMs: number;
	private readonly now: () => number;
	private drainInFlight: Promise<void> | null = null;

	constructor(options: ScrobbleServiceOptions) {
		this.deliverScrobble = options.deliverScrobble;
		this.queue = options.queue;
		this.maxAgeMs = options.maxAgeMs ?? defaultMaxAgeMs;
		this.now = options.now ?? Date.now;
	}

	getPendingCount(): number {
		return this.readPending().length;
	}

	// deliver everything pending, oldest first. delivered scrobbles are acked, as are ones whose track
	// no longer exists on the server; any other failure leaves the scrobble queued. overlapping
	// triggers (playback tick, reconnect, app ready) share the running drain, so nothing is delivered
	// twice and every caller waits for it to finish.
	syncFromNative(): Promise<void> {
		if (!this.drainInFlight) {
			this.drainInFlight = this.drain().finally(() => {
				this.drainInFlight = null;
			});
		}
		return this.drainInFlight;
	}

	private async drain(): Promise<void> {
		const nowMs = this.now();
		let consecutiveFailures = 0;
		for (const entry of this.readPending()) {
			if (entry.playedAtMs + this.maxAgeMs <= nowMs) {
				this.ack(entry);
				continue;
			}

			try {
				await this.deliverScrobble(entry.trackId, new Date(entry.playedAtMs).toISOString());
			} catch (error) {
				if (error === TransportErrors.LIVE_NOT_FOUND) {
					log.warn('scrobble dropped, track no longer on the server', {
						playedAtMs: entry.playedAtMs,
						trackId: entry.trackId,
					});
					this.ack(entry);
					continue;
				}
				log.warn('scrobble not delivered, keeping queued', {
					error: error instanceof Error ? error.message : String(error),
					playedAtMs: entry.playedAtMs,
					trackId: entry.trackId,
				});
				consecutiveFailures += 1;
				if (consecutiveFailures >= maxConsecutiveFailures) {
					return;
				}
				continue;
			}

			log.debug('scrobble delivered', { playedAtMs: entry.playedAtMs, trackId: entry.trackId });
			this.ack(entry);
		}
	}

	private readPending(): Array<PendingScrobble> {
		try {
			return this.queue.read();
		} catch (error) {
			log.warn('failed to read native scrobble queue', {
				error: error instanceof Error ? error.message : String(error),
			});
			return [];
		}
	}

	private ack(entry: PendingScrobble): void {
		try {
			this.queue.ack(entry.trackId, entry.playedAtMs);
		} catch (error) {
			log.warn('failed to ack scrobble', {
				error: error instanceof Error ? error.message : String(error),
				trackId: entry.trackId,
			});
		}
	}
}
