import { getLogger } from 'atolla_core/src/services/Logger';
import type { MemberSource } from 'atolla_sync/src/api/generated';
import type { AudioEngine } from './Audio';
import type { StateVersion } from './StateVersion';

export interface SourceTarget {
	host: string;
	port: number;
}

export interface AudioStream {
	join: (target: SourceTarget | null) => void;
	serve: (bindAddress: string, port: number) => boolean;
	served: () => number | null;
	source: () => MemberSource | undefined;
	tick: () => void;
}

export interface AudioStreamDeps {
	audio: Pick<AudioEngine, 'joinSource' | 'receiving' | 'serveStream'>;
	version: Pick<StateVersion, 'bump'>;
}

export function makeAudioStream({ audio, version }: AudioStreamDeps): AudioStream {
	const log = getLogger('stream');

	let joined: SourceTarget | null = null;
	let receiving = false;
	let served: number | null = null;

	return {
		join: (target) => {
			if (target?.host === joined?.host && target?.port === joined?.port) {
				return;
			}

			if (audio.joinSource(target?.host ?? '', target?.port ?? 0)) {
				joined = target;
			} else {
				log.warn('could not join the source', { host: target?.host, port: target?.port });
				joined = null;
			}

			receiving = audio.receiving();
			version.bump();
		},
		serve: (bindAddress, port) => {
			served = audio.serveStream(bindAddress, port) ? port : null;

			return served !== null;
		},
		served: () => served,
		source: () => (joined === null ? undefined : { ...joined, receiving }),
		tick: () => {
			const now = audio.receiving();
			if (now === receiving) {
				return;
			}

			receiving = now;
			version.bump();
		},
	};
}
