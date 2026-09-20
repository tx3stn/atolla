import type { MediaServer } from 'atolla_sync/src/api/generated';
import type { StateVersion } from './StateVersion';

export const PushOutcomes = {
	idMismatch: 'id_mismatch',
	stored: 'stored',
} as const;

export type PushOutcome = (typeof PushOutcomes)[keyof typeof PushOutcomes];

export interface MediaServerCredentials {
	drop(userId: string): void;
	get(userId: string): MediaServer | null;
	push(credential: MediaServer): PushOutcome;
	subscribe(listener: () => void): () => void;
	userIds(): Array<string>;
}

export function makeMediaServerCredentials(version: StateVersion): MediaServerCredentials {
	const held = new Map<string, MediaServer>();
	const listeners = new Set<() => void>();

	// The version is for a controller long polling `/state`. The listeners are for the daemon's own
	// parts, which have no other way to hear that a queue they were holding can play now.
	const changed = (): void => {
		version.bump();

		for (const listener of [...listeners]) {
			listener();
		}
	};

	return {
		drop: (userId) => {
			if (held.delete(userId)) {
				changed();
			}
		},
		get: (userId) => held.get(userId) ?? null,
		push: (credential) => {
			// Every credential names the same server, so the first one held answers for all of them.
			const [first] = held.values();
			if (first !== undefined && first.serverId !== credential.serverId) {
				return PushOutcomes.idMismatch;
			}

			held.set(credential.userId, credential);
			changed();

			return PushOutcomes.stored;
		},
		subscribe: (listener) => {
			listeners.add(listener);

			return () => {
				listeners.delete(listener);
			};
		},
		userIds: () => [...held.keys()],
	};
}
