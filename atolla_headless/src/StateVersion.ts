// Orders the changes a controller mirrors. It is not a count of commands: one command can settle
// several fields, and a track finishing changes the state with no command behind it.
export interface StateVersion {
	bump: () => void;
	readonly current: number;
	// Resolves with the version that overtook `since`, or with `since` itself when the wait ran out.
	waitPast: (since: number, timeoutMs: number) => Promise<number>;
}

export interface MirroredPlayback {
	isPlaying: boolean;
	loopMode: string;
	queueRevision: number;
	seekTarget: number | null;
	trackIndex: number;
}

// Position is deliberately absent: it advances continuously once an engine is attached, and a
// controller extrapolates it from the positionAtMs/positionMs pair instead. Including it would
// release every 25s long poll on every progress tick.
export function playbackSignature(playback: MirroredPlayback): string {
	return [
		playback.queueRevision,
		playback.trackIndex,
		playback.isPlaying ? 'playing' : 'paused',
		playback.loopMode,
		playback.seekTarget ?? '',
	].join('/');
}

type Waiter = {
	resolve: (version: number) => void;
	since: number;
	timer: ReturnType<typeof setTimeout>;
};

export function makeStateVersion(): StateVersion {
	const waiting = new Set<Waiter>();
	let current = 1;

	return {
		bump: () => {
			current += 1;

			for (const waiter of [...waiting]) {
				if (current > waiter.since) {
					waiting.delete(waiter);
					clearTimeout(waiter.timer);
					waiter.resolve(current);
				}
			}
		},
		get current() {
			return current;
		},
		waitPast: (since, timeoutMs) => {
			if (current !== since) {
				return Promise.resolve(current);
			}

			return new Promise<number>((resolve) => {
				const waiter: Waiter = {
					resolve,
					since,
					timer: setTimeout(() => {
						waiting.delete(waiter);
						resolve(since);
					}, timeoutMs),
				};

				waiting.add(waiter);
			});
		},
	};
}
