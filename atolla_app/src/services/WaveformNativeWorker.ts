import type { IWorkerService } from 'worker/src/IWorkerService';
import { WorkerServiceEntryPoint, workerService } from 'worker/src/WorkerServiceEntryPoint';
import { generateAtollaWaveformAsync } from '../WaveformNative';

export interface IWaveformNativeWorker {
	generateWaveform(trackId: string, audioPath: string): Promise<boolean>;
}

class WaveformNativeWorkerImpl implements IWaveformNativeWorker {
	generateWaveform(trackId: string, audioPath: string): Promise<boolean> {
		return new Promise((resolve) => {
			generateAtollaWaveformAsync(trackId, audioPath, resolve);
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
