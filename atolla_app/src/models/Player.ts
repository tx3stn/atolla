import type { Member, PlayerState } from 'atolla_sync/src/api/generated';

export const DEFAULT_PLAYER_GROUP = 'default';

export const PlayerStates = {
	idle: 'idle',
	paused: 'paused',
	playing: 'playing',
} as const satisfies Record<PlayerState, PlayerState>;

export const PlayerTiers = {
	loose: 'loose',
	tight: 'tight',
} as const satisfies Record<Member['tier'], Member['tier']>;

export interface Player {
	address: string | null;
	enabled: boolean;
	group: string;
	icon: string | null;
	id: string;
	isThisDevice: boolean;
	lastError: string | null;
	name: string;
	reachable: boolean;
	ready: boolean;
	state: PlayerState;
	tier: Member['tier'];
}

export interface PlayerSection {
	group: string;
	players: Array<Player>;
}

type WireFieldName = keyof { [K in keyof Member as string extends K ? never : K]: unknown };
type AssertNever<T extends never> = T;

type _ = AssertNever<Exclude<WireFieldName, keyof Player>>;
