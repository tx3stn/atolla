// @ts-nocheck
import type { IWorkerServiceClient } from 'worker/src/IWorkerService';
import { startWorkerService } from 'worker/src/WorkerService';
import type { IWaveformNativeWorker } from './WaveformNativeWorker';
import { WaveformNativeWorkerEntryPoint } from './WaveformNativeWorker';
import type { WaveformService } from './WaveformService';

interface QueueEntry {
	audioPath: string;
	trackId: string;
}

// Prioritised FIFO queue that generates waveform mask images for pending tracks.
// Queue entries are processed one at a time to avoid thrashing disk I/O.
// The queue order maps to PlaybackSession.queue order — callers should enqueue
// upcoming tracks before background tracks so the user hears waveforms first.
export class WaveformGenerationQueue {
	private queue: Array<QueueEntry> = [];
	private inProgress = false;
	private workerClient: IWorkerServiceClient<IWaveformNativeWorker>;

	constructor(private readonly waveformService: WaveformService) {
		this.workerClient = startWorkerService(WaveformNativeWorkerEntryPoint, []);
	}

	dispose(): void {
		this.workerClient.dispose();
	}

	// Enqueue a track for waveform generation. If the waveform is already ready
	// or failed, this is a no-op. Duplicate trackIds are deduplicated.
	enqueue(trackId: string, audioPath: string): void {
		if (this.waveformService.getMaskImageUrl(trackId) !== null) return;
		if (this.queue.some((e) => e.trackId === trackId)) return;
		this.queue.push({ audioPath, trackId });
		this.processNext();
	}

	// Move a trackId to the front of the queue (call when the user starts
	// playing a track whose waveform is still pending).
	prioritize(trackId: string): void {
		const idx = this.queue.findIndex((e) => e.trackId === trackId);
		if (idx <= 0) return;
		const [entry] = this.queue.splice(idx, 1);
		this.queue.unshift(entry);
	}

	private processNext(): void {
		if (this.inProgress || this.queue.length === 0) return;
		this.inProgress = true;
		// biome-ignore lint/style/noNonNullAssertion: length checked above
		const entry = this.queue.shift()!;
		void this.process(entry).finally(() => {
			this.inProgress = false;
			this.processNext();
		});
	}

	private async process(entry: QueueEntry): Promise<void> {
		const { trackId, audioPath } = entry;

		// Guard: another path may have already resolved this waveform.
		if (this.waveformService.getMaskImageUrl(trackId) !== null) return;

		try {
			const maskUrl = await this.workerClient.api.generateWaveform(trackId, audioPath);
			if (maskUrl) {
				this.waveformService.onGenerationSucceeded(trackId, maskUrl);
			} else {
				this.waveformService.onGenerationFailed(trackId);
			}
		} catch {
			this.waveformService.onGenerationFailed(trackId);
		}
	}
}
