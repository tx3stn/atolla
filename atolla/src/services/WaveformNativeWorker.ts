import type { IWorkerService } from 'worker/src/IWorkerService';
import { WorkerServiceEntryPoint, workerService } from 'worker/src/WorkerServiceEntryPoint';
import { generateAtollaWaveformAsync } from '../TrackPlaybackNative';

export interface IWaveformNativeWorker {
	generateWaveform(trackId: string, audioPath: string): Promise<string | null>;
}

class WaveformNativeWorkerImpl implements IWaveformNativeWorker {
	generateWaveform(trackId: string, audioPath: string): Promise<string | null> {
		return new Promise((resolve) => {
			generateAtollaWaveformAsync(trackId, audioPath, (outputUrl: string) => {
				resolve(outputUrl || null);
			});
		});
	}
}

@workerService('atolla_waveform_native', module)
export class WaveformNativeWorkerEntryPoint extends WorkerServiceEntryPoint<
	IWaveformNativeWorker,
	[]
> {
	start(): IWorkerService<IWaveformNativeWorker> {
		return {
			api: new WaveformNativeWorkerImpl(),
			dispose() {},
		};
	}
}
