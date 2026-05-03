import type { IWorkerService } from 'worker/src/IWorkerService';
import { WorkerServiceEntryPoint, workerService } from 'worker/src/WorkerServiceEntryPoint';
import type { MimeType } from '../images/MimeType';
import { computePalette } from './color/computePalette';
import type { Palette } from './color/types';

export interface IPaletteWorker {
	computePalette(buffer: ArrayBuffer, mimeType: MimeType): Promise<Palette | null>;
}

class PaletteWorkerImpl implements IPaletteWorker {
	computePalette(buffer: ArrayBuffer, mimeType: MimeType): Promise<Palette | null> {
		return computePalette(buffer, mimeType);
	}
}

@workerService('atolla_palette_generation', module)
export class PaletteWorkerEntryPoint extends WorkerServiceEntryPoint<IPaletteWorker, []> {
	start(): IWorkerService<IPaletteWorker> {
		return { api: new PaletteWorkerImpl(), dispose() {} };
	}
}
