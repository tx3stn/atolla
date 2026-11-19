import type { KeyValueStore } from 'atolla_core/src/stores/KeyValueStore';
import { normalizeServerUrl } from 'atolla_jellyfin/src/services/JellyfinAuthService';
import { IntegrationErrors } from '../IntegrationErrors';
import type { LidarrClient } from './Client';
import type { UpcomingService } from './UpcomingService';

const CONNECTION_KEY = 'connection';

export interface LidarrDetails {
	apiKey: string;
	url: string;
}

interface LidarrConnectionDeps {
	createClient: (url: string, apiKey: string) => LidarrClient;
	store: KeyValueStore;
	upcoming: UpcomingService;
}

export class LidarrConnection {
	private apiKey = '';
	private readonly listeners = new Set<() => void>();
	private url = '';

	constructor(private readonly deps: LidarrConnectionDeps) {}

	async connect(url: string, apiKey: string): Promise<void> {
		const normalizedUrl = normalizeServerUrl(url);
		const trimmedKey = apiKey.trim();
		const status = await this.deps.createClient(normalizedUrl, trimmedKey).status();
		if (status.appName !== 'Lidarr') {
			throw IntegrationErrors.WRONG_SERVICE;
		}
		await this.save(normalizedUrl, trimmedKey);
	}

	connected(): LidarrDetails | null {
		return this.apiKey === '' ? null : { apiKey: this.apiKey, url: this.url };
	}

	async disconnect(): Promise<void> {
		await this.save(this.url, '');
		await this.deps.upcoming.clear();
	}

	async load(): Promise<void> {
		try {
			const saved = JSON.parse(await this.deps.store.fetchString(CONNECTION_KEY)) as LidarrDetails;
			this.apiKey = saved.apiKey;
			this.url = saved.url;
		} catch {
			return;
		}
		this.notify();
	}

	savedUrl(): string {
		return this.url;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		for (const listener of [...this.listeners]) {
			listener();
		}
	}

	private save(url: string, apiKey: string): Promise<void> {
		this.apiKey = apiKey;
		this.url = url;
		this.notify();
		return this.deps.store.storeString(CONNECTION_KEY, JSON.stringify({ apiKey, url }));
	}
}
