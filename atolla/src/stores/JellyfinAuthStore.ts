// @ts-nocheck
import type { PersistentStore } from 'persistence/src/PersistentStore';

export interface StoredAuthSession {
	accessToken: string;
	serverId: string;
	serverUrl: string;
	userId: string;
}

function normalizeServerUrl(url: string): string {
	const trimmed = url.trim();
	const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
	return withScheme.replace(/\/+$/, '');
}

export interface JellyfinAuthStoreLike {
	clearSession(): Promise<void>;
	loadRememberedServerUrl(): Promise<string>;
	loadSession(): Promise<StoredAuthSession | null>;
	rememberServerUrl(serverUrl: string): Promise<void>;
	saveSession(session: StoredAuthSession): Promise<void>;
}

export class JellyfinAuthStore implements JellyfinAuthStoreLike {
	constructor(private store: PersistentStore) {}

	async loadSession(): Promise<StoredAuthSession | null> {
		try {
			const raw = await this.store.fetchString('session');
			const parsed = JSON.parse(raw) as Partial<StoredAuthSession>;
			if (
				typeof parsed.serverUrl !== 'string' ||
				typeof parsed.accessToken !== 'string' ||
				typeof parsed.serverId !== 'string' ||
				typeof parsed.userId !== 'string'
			) {
				return null;
			}
			return {
				accessToken: parsed.accessToken,
				serverId: parsed.serverId,
				serverUrl: parsed.serverUrl,
				userId: parsed.userId,
			};
		} catch {
			return null;
		}
	}

	async saveSession(session: StoredAuthSession): Promise<void> {
		if (
			!session ||
			typeof session.serverUrl !== 'string' ||
			typeof session.accessToken !== 'string' ||
			typeof session.serverId !== 'string' ||
			typeof session.userId !== 'string'
		) {
			throw new Error('invalid session');
		}

		await this.store.storeString('session', JSON.stringify(session));
		await this.rememberServerUrl(session.serverUrl);
	}

	async clearSession(): Promise<void> {
		await this.store.remove('session');
	}

	async rememberServerUrl(serverUrl: string): Promise<void> {
		await this.store.storeString('server_url', normalizeServerUrl(serverUrl));
	}

	async loadRememberedServerUrl(): Promise<string> {
		try {
			return await this.store.fetchString('server_url');
		} catch {
			return '';
		}
	}
}
