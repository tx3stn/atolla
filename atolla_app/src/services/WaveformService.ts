export type WaveformStatus = 'pending' | 'ready' | 'failed';

export interface WaveformFiles {
	clear(): void;
	count(): Promise<number>;
	has(trackId: string): boolean;
}

export const WAVEFORM_MAX_ATTEMPTS = 3;

export class WaveformService {
	private failureCounts = new Map<string, number>();
	private listeners = new Set<() => void>();
	private sessionStatuses = new Map<string, 'pending' | 'failed'>();

	constructor(private files: WaveformFiles) {}

	clearAll(): void {
		this.files.clear();
		this.sessionStatuses.clear();
		this.failureCounts.clear();
		this.notify();
	}

	countStored(): Promise<number> {
		return this.files.count();
	}

	getStatus(trackId: string): WaveformStatus | null {
		return this.sessionStatuses.get(trackId) ?? (this.files.has(trackId) ? 'ready' : null);
	}

	isStored(trackId: string): boolean {
		return this.files.has(trackId);
	}

	onGenerationFailed(trackId: string): void {
		if (this.sessionStatuses.get(trackId) !== 'pending') return;
		this.failureCounts.set(trackId, (this.failureCounts.get(trackId) ?? 0) + 1);
		this.sessionStatuses.set(trackId, 'failed');
		this.notify();
	}

	onGenerationSucceeded(trackId: string): void {
		if (this.sessionStatuses.get(trackId) !== 'pending') return;
		this.sessionStatuses.delete(trackId);
		this.failureCounts.delete(trackId);
		this.notify();
	}

	scheduleGeneration(trackId: string): void {
		const status = this.getStatus(trackId);
		if (status === 'pending' || status === 'ready') return;
		if (status === 'failed' && (this.failureCounts.get(trackId) ?? 0) >= WAVEFORM_MAX_ATTEMPTS) {
			return;
		}
		this.sessionStatuses.set(trackId, 'pending');
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
}
