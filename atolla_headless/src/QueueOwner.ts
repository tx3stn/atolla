import { getLogger } from 'atolla_core/src/services/Logger';
import type { KeyValueStore } from 'atolla_core/src/stores/KeyValueStore';

export const QUEUE_OWNER_KEY = 'queue_owner';

export interface QueueOwner {
	claim(userId: string): void;
	clear(): void;
	get(): string | null;
	load(): Promise<void>;
}

const log = getLogger('queue-owner');

// An account id rather than a credential, so this one survives a restart while the credential it
// selects does not.
export function makeQueueOwner(store: KeyValueStore): QueueOwner {
	let owner: string | null = null;

	const persist = (next: string | null): void => {
		if (next === owner) {
			return;
		}

		owner = next;
		store.storeString(QUEUE_OWNER_KEY, next ?? '').catch((error: unknown) => {
			log.warn('could not persist the owner', { error: String(error) });
		});
	};

	return {
		claim: (userId) => {
			persist(userId);
		},
		clear: () => {
			persist(null);
		},
		get: () => owner,
		load: async () => {
			const stored = await store.fetchString(QUEUE_OWNER_KEY).catch(() => '');
			owner = stored === '' ? null : stored;
		},
	};
}
