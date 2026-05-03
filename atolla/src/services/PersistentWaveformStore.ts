import type { PersistentStore } from 'persistence/src/PersistentStore';
import type { WaveformRecord, WaveformStore } from './WaveformService';

const STORE_KEY = 'waveform_records';

export class PersistentWaveformStore implements WaveformStore {
	constructor(private store: PersistentStore) {}

	async load(): Promise<Record<string, WaveformRecord>> {
		try {
			const json = await this.store.fetchString(STORE_KEY);
			if (!json) return {};
			const parsed: unknown = JSON.parse(json);
			return isWaveformRecordMap(parsed) ? parsed : {};
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

const WAVEFORM_STATUSES = new Set(['pending', 'ready', 'failed']);

function isWaveformRecord(value: unknown): value is WaveformRecord {
	if (typeof value !== 'object' || value === null) return false;
	const r = value as Record<string, unknown>;
	return (
		typeof r.trackId === 'string' &&
		typeof r.status === 'string' &&
		WAVEFORM_STATUSES.has(r.status) &&
		(r.maskImageUrl === null || typeof r.maskImageUrl === 'string')
	);
}

function isWaveformRecordMap(value: unknown): value is Record<string, WaveformRecord> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
	return Object.values(value as Record<string, unknown>).every(isWaveformRecord);
}
