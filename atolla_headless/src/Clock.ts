import { getLogger } from 'atolla_core/src/services/Logger';
import type { ClockReading, MemberClock } from 'atolla_sync/src/api/generated';
import type { AudioEngine } from './Audio';
import type { StateVersion } from './StateVersion';

export interface ClockTarget {
	host: string;
	port: number;
}

export interface Clock {
	follow: (target: ClockTarget | null) => void;
	member: () => MemberClock;
	provide: (bindAddress: string, port: number) => boolean;
	reading: () => ClockReading | null;
	tick: () => void;
}

export interface ClockDeps {
	audio: Pick<AudioEngine, 'clockNowNs' | 'clockSynced' | 'followClock' | 'provideClock'>;
	version: Pick<StateVersion, 'bump'>;
}

export function makeClock({ audio, version }: ClockDeps): Clock {
	const log = getLogger('clock');

	let following: ClockTarget | null = null;
	let served: number | null = null;
	let synced = true;

	return {
		follow: (target) => {
			if (target?.host === following?.host && target?.port === following?.port) {
				return;
			}

			if (audio.followClock(target?.host ?? '', target?.port ?? 0)) {
				following = target;
			} else {
				log.warn('could not follow the clock', { host: target?.host, port: target?.port });
				following = null;
			}

			synced = audio.clockSynced();
			version.bump();
		},
		member: () => (following === null ? { synced } : { following: { ...following }, synced }),
		provide: (bindAddress, port) => {
			served = audio.provideClock(bindAddress, port) ? port : null;

			return served !== null;
		},
		reading: () => (served === null ? null : { nowNs: audio.clockNowNs(), port: served }),
		tick: () => {
			const now = audio.clockSynced();
			if (now === synced) {
				return;
			}

			synced = now;
			version.bump();
		},
	};
}
