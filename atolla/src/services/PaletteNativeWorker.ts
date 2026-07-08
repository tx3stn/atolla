import type { IWorkerService } from 'worker/src/IWorkerService';
import { WorkerServiceEntryPoint, workerService } from 'worker/src/WorkerServiceEntryPoint';
import { extractAtollaPaletteFromCache } from '../ImageLoaderBootstrap';
import type { Palette } from '../models/Color';

export interface IPaletteNativeWorker {
	extractPalette(url: string, category: string): Promise<Palette | null>;
}

class PaletteNativeWorkerImpl implements IPaletteNativeWorker {
	extractPalette(url: string, category: string): Promise<Palette | null> {
		try {
			const raw = extractAtollaPaletteFromCache(url, category);
			if (!raw) return Promise.resolve(null);
			const parsed = JSON.parse(raw) as Partial<Palette>;
			if (!parsed.accent?.hex) return Promise.resolve(null);
			return Promise.resolve(parsed as Palette);
		} catch {
			return Promise.resolve(null);
		}
	}
}

@workerService('atolla_palette_native', module)
export class PaletteNativeWorkerEntryPoint extends WorkerServiceEntryPoint<
	IPaletteNativeWorker,
	[]
> {
	start(): IWorkerService<IPaletteNativeWorker> {
		return {
			api: new PaletteNativeWorkerImpl(),
			dispose() {},
		};
	}
}
