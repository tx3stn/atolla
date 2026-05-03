import type { IWorkerService } from 'worker/src/IWorkerService';
import { WorkerServiceEntryPoint, workerService } from 'worker/src/WorkerServiceEntryPoint';
import {
	cacheAtollaDownloadedTrackFromUrlAsync,
	removeAtollaDownloadedTrack,
} from '../TrackPlaybackNative';

export interface IDownloadNativeWorker {
	cacheDownloadedTrack(trackId: string, url: string): Promise<void>;
	removeDownloadedTrack(trackId: string): Promise<void>;
	removeDownloadedTracks(trackIds: Array<string>): Promise<void>;
}

const REMOVE_BATCH_SIZE = 32;

function waitForNextTick(): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, 0);
	});
}

class DownloadNativeWorkerImpl implements IDownloadNativeWorker {
	cacheDownloadedTrack(trackId: string, url: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			cacheAtollaDownloadedTrackFromUrlAsync(trackId, url, (source) => {
				if (source) {
					resolve();
					return;
				}
				reject(new Error('cacheAtollaDownloadedTrackFromUrlAsync returned no source'));
			});
		});
	}

	removeDownloadedTrack(trackId: string): Promise<void> {
		removeAtollaDownloadedTrack(trackId);
		return Promise.resolve();
	}

	async removeDownloadedTracks(trackIds: Array<string>): Promise<void> {
		for (let i = 0; i < trackIds.length; i += 1) {
			removeAtollaDownloadedTrack(trackIds[i]);
			if ((i + 1) % REMOVE_BATCH_SIZE === 0) {
				await waitForNextTick();
			}
		}
	}
}

@workerService('atolla_download_native', module)
export class DownloadNativeWorkerEntryPoint extends WorkerServiceEntryPoint<
	IDownloadNativeWorker,
	[]
> {
	start(): IWorkerService<IDownloadNativeWorker> {
		return {
			api: new DownloadNativeWorkerImpl(),
			dispose() {},
		};
	}
}
