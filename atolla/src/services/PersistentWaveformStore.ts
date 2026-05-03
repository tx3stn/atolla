import type { PersistentStore } from 'persistence/src/PersistentStore';
import type { WaveformRecord, WaveformStore } from './WaveformService';

const STORE_KEY = 'waveform_records';

export class PersistentWaveformStore implements WaveformStore {
	constructor(private store: PersistentStore) {}

	async load(): Promise<Record<string, WaveformRecord>> {
		try {
			const json = await this.store.fetchString(STORE_KEY);
			if (!json) return {};
			return JSON.parse(json) as Record<string, WaveformRecord>;
		} catch {
			return {};
		}
	}

	async save(records: Record<string, WaveformRecord>): Promise<void> {
		try {
			await this.store.storeString(STORE_KEY, JSON.stringify(records));
		} catch {
			// best-effort persistence
		}
	}
}
