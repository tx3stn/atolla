import type { KeyValueStore } from 'atolla_core/src/stores/KeyValueStore';
import { version } from 'atolla_core/src/version';
import type { RandomBytes } from './Random';

export const IDENTITY_KEY = 'identity';

const ID_BYTES = 8;
const ID_PATTERN = /^[0-9a-f]{16}$/;

export type SyncTier = 'tight' | 'loose';

export interface PlayerIdentity {
	id: string;
	name: string;
	tier: SyncTier;
	version: string;
}

export async function loadPlayerIdentity(
	store: KeyValueStore,
	randomBytes: RandomBytes,
	name: string,
): Promise<PlayerIdentity> {
	return { id: await loadOrCreateId(store, randomBytes), name, tier: 'tight', version };
}

function generateId(randomBytes: RandomBytes): string {
	return Array.from(randomBytes(ID_BYTES), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function loadOrCreateId(store: KeyValueStore, randomBytes: RandomBytes): Promise<string> {
	const stored = (await store.fetchString(IDENTITY_KEY).catch(() => '')).trim();
	if (ID_PATTERN.test(stored)) {
		return stored;
	}

	const id = generateId(randomBytes);
	await store.storeString(IDENTITY_KEY, id);

	return id;
}
