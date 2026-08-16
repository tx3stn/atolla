export type NetworkTransport = 'wifi' | 'cellular' | 'none';

export interface NetworkStatusSnapshot {
	reachable: boolean;
	transport: NetworkTransport;
}

// abstracts the native reachability module so NetworkStatus can be unit tested with a fake.
// getStatusJson returns the native JSON blob; observe registers a change listener and returns
// an unsubscribe.
export interface NetworkReachabilitySource {
	getStatusJson(): string;
	observe(onChange: () => void): () => void;
}

// when the native module is absent (tests, desktop) reads come back empty; assume reachable so
// downloads behave as they did before real connectivity existed rather than wedging offline
const ASSUMED_ONLINE: NetworkStatusSnapshot = { reachable: true, transport: 'none' };

export function parseNetworkStatus(json: string): NetworkStatusSnapshot {
	try {
		const parsed = JSON.parse(json) as { reachable?: unknown; transport?: unknown };
		return {
			reachable: parsed.reachable === true,
			transport: normalizeTransport(parsed.transport),
		};
	} catch {
		return ASSUMED_ONLINE;
	}
}

function normalizeTransport(value: unknown): NetworkTransport {
	return value === 'wifi' || value === 'cellular' ? value : 'none';
}

export class NetworkStatus {
	private readonly source: NetworkReachabilitySource;
	private readonly subscribers = new Set<() => void>();
	private readonly unobserve: () => void;

	constructor(source: NetworkReachabilitySource) {
		this.source = source;
		this.unobserve = source.observe(() => this.notify());
	}

	dispose(): void {
		this.unobserve();
		this.subscribers.clear();
	}

	getTransport(): NetworkTransport {
		return this.read().transport;
	}

	isReachable(): boolean {
		return this.read().reachable;
	}

	subscribe(callback: () => void): () => void {
		this.subscribers.add(callback);
		return () => {
			this.subscribers.delete(callback);
		};
	}

	private notify(): void {
		for (const callback of this.subscribers) {
			callback();
		}
	}

	// always reads the native getter so a dropped/absent observer can't leave a stale value
	private read(): NetworkStatusSnapshot {
		return parseNetworkStatus(this.source.getStatusJson());
	}
}
