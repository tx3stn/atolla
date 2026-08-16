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
	// native work still runs but the result is dropped so a higher-priority
	// track can take the freed slot
	abandoned: boolean;
	entry: QueueEntry;
}

// safe to run 3 in parallel: waveform work is lightweight (4 kHz resample + strided sampling)
const CONCURRENCY = 3;

// concurrent queue extracting waveform amplitudes; order maps to the play queue
// so upcoming tracks are processed first
export class WaveformGenerationQueue {
	private queue: Array<QueueEntry> = [];
	private allWorkers: Array<IWorkerServiceClient<IWaveformNativeWorker>>;
	private idleWorkers: Array<IWorkerServiceClient<IWaveformNativeWorker>>;
	private activeJobs: Array<ActiveJob> = [];

	constructor(private readonly waveformService: WaveformService) {
		this.allWorkers = Array.from({ length: CONCURRENCY }, () =>
			startWorkerService(WaveformNativeWorkerEntryPoint, []),
		);
		this.idleWorkers = [...this.allWorkers];
	}

	dispose(): void {
		for (const worker of this.allWorkers) worker.dispose();
	}

	// no-op if the waveform is already ready/failed, or the track is queued or in-flight
	enqueue(trackId: string, audioPath: string): void {
		const status = this.waveformService.getStatus(trackId);
		if (status === 'ready' || status === 'failed') return;
		if (this.queue.some((e) => e.trackId === trackId)) return;
		if (this.activeJobs.some((j) => j.entry.trackId === trackId && !j.abandoned)) return;
		this.queue.push({ audioPath, trackId });
		this.processNext();
	}

	// reorder pending entries to match trackIds, then abandon in-flight jobs now
	// lower-priority than the front so their slots free sooner
	reorderToMatch(trackIds: Array<string>): void {
		if (this.queue.length > 1) {
			const byTrackId = new Map(this.queue.map((e) => [e.trackId, e]));
			const ordered: Array<QueueEntry> = [];
			for (const trackId of trackIds) {
				const entry = byTrackId.get(trackId);
				if (entry) {
					ordered.push(entry);
					byTrackId.delete(trackId);
				}
			}
			this.queue = [...ordered, ...byTrackId.values()];
		}
		this.abandonLowPriorityJobs(trackIds);
		this.processNext();
	}

	prioritize(trackId: string): void {
		const idx = this.queue.findIndex((e) => e.trackId === trackId);
		if (idx <= 0) return;
		const [entry] = this.queue.splice(idx, 1);
		this.queue.unshift(entry);
	}

	// abandon in-flight jobs ranked below the queue front: native work finishes
	// but the result is dropped and the track is re-queued at the back
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
		if (this.waveformService.getAmps(trackId) !== null) return;
		try {
			const amps = await worker.api.generateWaveform(trackId, audioPath);
			if (job.abandoned) return;
			if (amps) {
				this.waveformService.onGenerationSucceeded(trackId, amps);
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
