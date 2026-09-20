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
	userIds(): Array<string>;
}

export function makeMediaServerCredentials(version: StateVersion): MediaServerCredentials {
	const held = new Map<string, MediaServer>();

	return {
		drop: (userId) => {
			if (held.delete(userId)) {
				version.bump();
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
			version.bump();

			return PushOutcomes.stored;
		},
		userIds: () => [...held.keys()],
	};
}
