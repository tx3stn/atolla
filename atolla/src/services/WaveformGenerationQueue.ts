import type { IWorkerServiceClient } from 'worker/src/IWorkerService';
import { startWorkerService } from 'worker/src/WorkerService';
import type { IWaveformNativeWorker } from './WaveformNativeWorker';
import { WaveformNativeWorkerEntryPoint } from './WaveformNativeWorker';
import type { WaveformService } from './WaveformService';

interface QueueEntry {
	audioPath: string;
	trackId: string;
}

interface ActiveJob {
	// When true the native work still runs but its result is discarded so a
	// higher-priority track can use the next freed slot.
	abandoned: boolean;
	entry: QueueEntry;
}

// Number of tracks generated in parallel. Waveform work is now lightweight
// (4 kHz resample + strided sampling) so running 3 at once is safe.
const CONCURRENCY = 3;

// Prioritised concurrent queue that generates waveform mask images.
// Up to CONCURRENCY tracks are processed in parallel; the queue order maps to
// PlaybackSession.queue so upcoming tracks are generated first.
export class WaveformGenerationQueue {
	private queue: Array<QueueEntry> = [];
	private idleWorkers: Array<IWorkerServiceClient<IWaveformNativeWorker>>;
	private activeJobs: Array<ActiveJob> = [];

	constructor(private readonly waveformService: WaveformService) {
		this.idleWorkers = Array.from({ length: CONCURRENCY }, () =>
			startWorkerService(WaveformNativeWorkerEntryPoint, []),
		);
	}

	dispose(): void {
		for (const worker of this.idleWorkers) worker.dispose();
	}

	// Enqueue a track for waveform generation. No-op if the waveform is already
	// ready/failed or the track is already queued or in-flight.
	enqueue(trackId: string, audioPath: string): void {
		if (this.waveformService.getMaskImageUrl(trackId) !== null) return;
		if (this.queue.some((e) => e.trackId === trackId)) return;
		if (this.activeJobs.some((j) => j.entry.trackId === trackId && !j.abandoned)) return;
		this.queue.push({ audioPath, trackId });
		this.processNext();
	}

	// Reorder pending queue entries to match the given trackId sequence, then
	// abandon any in-flight jobs that are now lower priority than the queue
	// front so their slots free up sooner.
	reorderToMatch(trackIds: Array<string>): void {
		if (this.queue.length > 1) {
			const remaining = [...this.queue];
			const ordered: Array<QueueEntry> = [];
			for (const trackId of trackIds) {
				const idx = remaining.findIndex((e) => e.trackId === trackId);
				if (idx >= 0) ordered.push(...remaining.splice(idx, 1));
			}
			this.queue = [...ordered, ...remaining];
		}
		this.abandonLowPriorityJobs(trackIds);
		this.processNext();
	}

	// Move a trackId to the front of the queue.
	prioritize(trackId: string): void {
		const idx = this.queue.findIndex((e) => e.trackId === trackId);
		if (idx <= 0) return;
		const [entry] = this.queue.splice(idx, 1);
		this.queue.unshift(entry);
	}

	// Mark in-flight jobs that rank below the current queue front as abandoned.
	// Their native work completes but the result is discarded; the track is
	// re-queued at the back so it eventually gets processed.
	private abandonLowPriorityJobs(desiredOrder: Array<string>): void {
		if (this.queue.length === 0 || this.idleWorkers.length > 0) return;
		const frontPriority = desiredOrder.indexOf(this.queue[0].trackId);
		if (frontPriority < 0) return;
		for (const job of this.activeJobs) {
			if (job.abandoned) continue;
			const p = desiredOrder.indexOf(job.entry.trackId);
			const effectivePriority = p < 0 ? Number.MAX_SAFE_INTEGER : p;
			if (effectivePriority > frontPriority) {
				job.abandoned = true;
				this.queue.push(job.entry);
			}
		}
	}

	private processNext(): void {
		while (this.idleWorkers.length > 0 && this.queue.length > 0) {
			// biome-ignore lint/style/noNonNullAssertion: both lengths checked above
			const worker = this.idleWorkers.pop()!;
			// biome-ignore lint/style/noNonNullAssertion: both lengths checked above
			const entry = this.queue.shift()!;
			const job: ActiveJob = { abandoned: false, entry };
			this.activeJobs.push(job);
			void this.process(worker, job).finally(() => {
				const idx = this.activeJobs.indexOf(job);
				if (idx >= 0) this.activeJobs.splice(idx, 1);
				this.idleWorkers.push(worker);
				this.processNext();
			});
		}
	}

	private async process(
		worker: IWorkerServiceClient<IWaveformNativeWorker>,
		job: ActiveJob,
	): Promise<void> {
		const { trackId, audioPath } = job.entry;
		if (this.waveformService.getMaskImageUrl(trackId) !== null) return;
		try {
			const maskUrl = await worker.api.generateWaveform(trackId, audioPath);
			if (job.abandoned) return;
			if (maskUrl) {
				this.waveformService.onGenerationSucceeded(trackId, maskUrl);
			} else {
				this.waveformService.onGenerationFailed(trackId);
			}
		} catch {
			if (!job.abandoned) {
				this.waveformService.onGenerationFailed(trackId);
			}
		}
	}
}
