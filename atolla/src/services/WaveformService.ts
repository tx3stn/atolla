export type WaveformStatus = 'pending' | 'ready' | 'failed';

export interface WaveformRecord {
	maskImageUrl: string | null;
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

	constructor(private store: WaveformStore) {}

	async warmUp(): Promise<void> {
		const saved = await this.store.load();
		for (const [trackId, record] of Object.entries(saved)) {
			this.records.set(trackId, record);
		}
		this.notify();
	}

	scheduleGeneration(trackId: string): void {
		if (this.records.has(trackId)) return;
		this.records.set(trackId, { maskImageUrl: null, status: 'pending', trackId });
		void this.persist();
		this.notify();
	}

	onGenerationSucceeded(trackId: string, maskImageUrl: string): void {
		const record = this.records.get(trackId);
		if (record?.status !== 'pending') return;
		this.records.set(trackId, { maskImageUrl, status: 'ready', trackId });
		void this.persist();
		this.notify();
	}

	onGenerationFailed(trackId: string): void {
		const record = this.records.get(trackId);
		if (record?.status !== 'pending') return;
		this.records.set(trackId, { maskImageUrl: null, status: 'failed', trackId });
		void this.persist();
		this.notify();
	}

	removeForTrack(trackId: string): void {
		if (!this.records.has(trackId)) return;
		this.records.delete(trackId);
		void this.persist();
		this.notify();
	}

	clearAll(): void {
		if (this.records.size === 0) return;
		this.records.clear();
		void this.persist();
		this.notify();
	}

	getMaskImageUrl(trackId: string): string | null {
		const record = this.records.get(trackId);
		return record?.status === 'ready' ? (record.maskImageUrl ?? null) : null;
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
		await this.store.save(snapshot);
	}
}
