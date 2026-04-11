export interface PendingScrobble {
	trackId: string;
	triggeredAt: string;
}

export interface ScrobbleStore {
	fetchString(key: string): Promise<string>;
	storeString(key: string, value: string): Promise<void>;
}

export interface PlaybackSnapshot {
	hasSeekTarget: boolean;
	isPlaying: boolean;
	progressSeconds: number;
	trackDurationSeconds: number;
	trackId: string | null;
}

export interface ScrobbleServiceOptions {
	deliverScrobble: (pending: PendingScrobble) => Promise<void>;
	maxAgeMs?: number;
	now?: () => number;
	store: ScrobbleStore;
	thresholdRatio?: number;
}

const pendingScrobblesKey = 'pending_scrobbles';
const defaultThresholdRatio = 0.8;
const defaultMaxAgeMs = 30 * 24 * 60 * 60 * 1000;

interface TrackPlayState {
	activeListenSeconds: number;
	lastProgressSeconds: number;
	scrobbleTriggered: boolean;
	trackDurationSeconds: number;
	trackId: string;
}

export class ScrobbleService {
	private readonly now: () => number;
	private readonly thresholdRatio: number;
	private readonly maxAgeMs: number;
	private readonly store: ScrobbleStore;
	private readonly deliverScrobble: (pending: PendingScrobble) => Promise<void>;

	private pendingScrobbles: Array<PendingScrobble> = [];
	private isLoaded = false;
	private operationChain: Promise<void> = Promise.resolve();
	private retryInProgress = false;

	private trackPlay: TrackPlayState | null = null;

	constructor(options: ScrobbleServiceOptions) {
		this.store = options.store;
		this.deliverScrobble = options.deliverScrobble;
		this.thresholdRatio = options.thresholdRatio ?? defaultThresholdRatio;
		this.maxAgeMs = options.maxAgeMs ?? defaultMaxAgeMs;
		this.now = options.now ?? Date.now;
	}

	observePlayback(snapshot: PlaybackSnapshot): void {
		if (!snapshot.trackId || snapshot.trackDurationSeconds <= 0) {
			this.trackPlay = null;
			return;
		}

		if (this.trackPlay == null || this.trackPlay.trackId !== snapshot.trackId) {
			this.trackPlay = {
				activeListenSeconds: 0,
				lastProgressSeconds: sanitizeProgress(snapshot.progressSeconds),
				scrobbleTriggered: false,
				trackDurationSeconds: snapshot.trackDurationSeconds,
				trackId: snapshot.trackId,
			};
			return;
		}

		const currentPlay = this.trackPlay;
		const nextProgress = sanitizeProgress(snapshot.progressSeconds);
		const delta = nextProgress - currentPlay.lastProgressSeconds;

		if (delta < 0) {
			this.trackPlay = {
				activeListenSeconds: 0,
				lastProgressSeconds: nextProgress,
				scrobbleTriggered: false,
				trackDurationSeconds: snapshot.trackDurationSeconds,
				trackId: snapshot.trackId,
			};
			return;
		}

		currentPlay.trackDurationSeconds = snapshot.trackDurationSeconds;
		currentPlay.lastProgressSeconds = nextProgress;

		if (snapshot.isPlaying && !snapshot.hasSeekTarget && delta > 0) {
			currentPlay.activeListenSeconds += delta;
		}

		if (currentPlay.scrobbleTriggered) {
			return;
		}

		const thresholdSeconds = currentPlay.trackDurationSeconds * this.thresholdRatio;
		if (currentPlay.activeListenSeconds < thresholdSeconds) {
			return;
		}

		currentPlay.scrobbleTriggered = true;
		const pending: PendingScrobble = {
			trackId: currentPlay.trackId,
			triggeredAt: new Date(this.now()).toISOString(),
		};

		this.enqueueOperation(async () => {
			await this.ensureLoaded();
			this.pendingScrobbles.push(pending);
			this.sortPending();
			await this.persistPendingScrobbles();
			const delivered = await this.attemptDelivery(pending);
			if (!delivered) {
				return;
			}
			await this.retryAllPending();
		});
	}

	onAppReady(): Promise<void> {
		this.enqueueOperation(async () => {
			await this.ensureLoaded();
			this.pruneExpiredPending();
			await this.persistPendingScrobbles();
			await this.retryAllPending();
		});

		return this.flush();
	}

	getPendingScrobbles(): Array<PendingScrobble> {
		return [...this.pendingScrobbles];
	}

	flush(): Promise<void> {
		return this.operationChain;
	}

	private enqueueOperation(operation: () => Promise<void>): void {
		this.operationChain = this.operationChain.then(operation, operation);
	}

	private async ensureLoaded(): Promise<void> {
		if (this.isLoaded) {
			return;
		}

		try {
			const raw = await this.store.fetchString(pendingScrobblesKey);
			const parsed = JSON.parse(raw) as Array<PendingScrobble>;
			this.pendingScrobbles = parsed.filter(isPendingScrobble);
			this.sortPending();
		} catch {
			this.pendingScrobbles = [];
		}

		this.isLoaded = true;
	}

	private sortPending(): void {
		this.pendingScrobbles.sort((left, right) => {
			const leftMs = Date.parse(left.triggeredAt);
			const rightMs = Date.parse(right.triggeredAt);
			if (Number.isNaN(leftMs) && Number.isNaN(rightMs)) {
				return 0;
			}
			if (Number.isNaN(leftMs)) {
				return 1;
			}
			if (Number.isNaN(rightMs)) {
				return -1;
			}
			return leftMs - rightMs;
		});
	}

	private pruneExpiredPending(): void {
		const nowMs = this.now();
		this.pendingScrobbles = this.pendingScrobbles.filter((pending) => {
			const triggeredAtMs = Date.parse(pending.triggeredAt);
			if (Number.isNaN(triggeredAtMs)) {
				return false;
			}
			return triggeredAtMs + this.maxAgeMs > nowMs;
		});
	}

	private persistPendingScrobbles(): Promise<void> {
		return this.store.storeString(pendingScrobblesKey, JSON.stringify(this.pendingScrobbles));
	}

	private async retryAllPending(): Promise<void> {
		if (this.retryInProgress) {
			return;
		}

		this.retryInProgress = true;
		try {
			let consecutiveFailures = 0;
			for (const pending of [...this.pendingScrobbles]) {
				const delivered = await this.attemptDelivery(pending);
				if (delivered) {
					consecutiveFailures = 0;
					continue;
				}

				consecutiveFailures += 1;
				if (consecutiveFailures >= 3) {
					break;
				}
			}
		} finally {
			this.retryInProgress = false;
		}
	}

	private async attemptDelivery(pending: PendingScrobble): Promise<boolean> {
		try {
			await this.deliverScrobble(pending);
		} catch {
			return false;
		}

		const index = this.pendingScrobbles.findIndex(
			(candidate) =>
				candidate.trackId === pending.trackId && candidate.triggeredAt === pending.triggeredAt,
		);
		if (index >= 0) {
			this.pendingScrobbles.splice(index, 1);
			await this.persistPendingScrobbles();
		}

		return true;
	}
}

function isPendingScrobble(value: unknown): value is PendingScrobble {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const candidate = value as Partial<PendingScrobble>;
	return typeof candidate.trackId === 'string' && typeof candidate.triggeredAt === 'string';
}

function sanitizeProgress(value: number): number {
	if (!Number.isFinite(value) || value < 0) {
		return 0;
	}
	return value;
}
