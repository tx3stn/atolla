export type WaveformStatus = 'pending' | 'ready' | 'failed';

export interface WaveformRecord {
	amps: string | null;
	status: WaveformStatus;
	trackId: string;
}

export interface WaveformStore {
	load(): Promise<Record<string, WaveformRecord>>;
	save(records: Record<string, WaveformRecord>): Promise<void>;
}

export class WaveformService {
	private records = new Map<string, WaveformRecord>();
	private listeners = new Set<() => void>();
	private persistScheduled = false;

	constructor(private store: WaveformStore) {}

	async warmUp(): Promise<void> {
		const saved = await this.store.load();
		for (const [trackId, record] of Object.entries(saved)) {
			this.records.set(trackId, record);
		}
		this.notify();
	}

	scheduleGeneration(trackId: string): void {
		// 'failed' is terminal: re-scheduling it would re-decode on every queue change, and since a
		// failing decode (e.g. MediaCodec resource exhaustion) keeps failing, that churns codecs and
		// the JS↔native callbacks feeding them. a fresh attempt requires removeForTrack first.
		if (this.records.has(trackId)) return;
		this.records.set(trackId, { amps: null, status: 'pending', trackId });
	}

	getStatus(trackId: string): WaveformStatus | null {
		return this.records.get(trackId)?.status ?? null;
	}

	onGenerationSucceeded(trackId: string, amps: string): void {
		const record = this.records.get(trackId);
		if (record?.status !== 'pending') return;
		this.records.set(trackId, { amps, status: 'ready', trackId });
		this.schedulePersist();
		this.notify();
	}

	onGenerationFailed(trackId: string): void {
		const record = this.records.get(trackId);
		if (record?.status !== 'pending') return;
		this.records.set(trackId, { amps: null, status: 'failed', trackId });
		this.schedulePersist();
		this.notify();
	}

	removeForTrack(trackId: string): void {
		if (!this.records.has(trackId)) return;
		this.records.delete(trackId);
		this.schedulePersist();
		this.notify();
	}

	clearAll(): void {
		if (this.records.size === 0) return;
		this.records.clear();
		this.schedulePersist();
		this.notify();
	}

	getCount(): number {
		return this.records.size;
	}

	getReadyCount(): number {
		let count = 0;
		for (const record of this.records.values()) {
			if (record.status === 'ready') count++;
		}
		return count;
	}

	getAmps(trackId: string): string | null {
		const record = this.records.get(trackId);
		return record?.status === 'ready' ? (record.amps ?? null) : null;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}

	private async persist(): Promise<void> {
		const snapshot: Record<string, WaveformRecord> = {};
		for (const [id, record] of this.records) {
			snapshot[id] = record;
		}
		try {
			await this.store.save(snapshot);
		} catch (err) {
			console.warn('[waveforms] failed to persist records', err);
		}
	}

	private schedulePersist(): void {
		if (this.persistScheduled) return;
		this.persistScheduled = true;
		setTimeout(() => {
			this.persistScheduled = false;
			void this.persist();
		}, 0);
	}
}
