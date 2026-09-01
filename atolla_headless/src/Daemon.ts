import {
	getLogger,
	LOG_LEVELS,
	Logger,
	type LogLevel,
	type LogWriter,
} from 'atolla_core/src/services/Logger';
import { PlaybackStore } from 'atolla_player/src/stores/Playback';
import { makeFileKeyValueStore, type StoreFiles } from './FileKeyValueStore';
import { type PlayerConfig, stateDir } from './PlayerConfig';

export interface DaemonDeps {
	config: PlayerConfig;
	files: StoreFiles;
	log: LogWriter;
}

export function filterLogWriter(minimum: LogLevel, write: (entry: string) => void): LogWriter {
	const floor = LOG_LEVELS.indexOf(minimum);

	return (level, entry) => {
		if (LOG_LEVELS.indexOf(level) >= floor) {
			write(entry);
		}
	};
}

export async function startDaemon(deps: DaemonDeps): Promise<number> {
	Logger.setWriter(deps.log);

	const log = getLogger('daemon');
	log.debug('started', { dataDir: deps.config.dataDir, name: deps.config.name });

	const state = stateDir(deps.config);
	const playback = new PlaybackStore();
	await playback.setPersistence({
		progress: makeFileKeyValueStore(deps.files, state),
		queue: makeFileKeyValueStore(deps.files, state),
	});

	log.info('queue restored', {
		trackIndex: playback.trackIndex,
		tracks: playback.tracks.length,
	});

	return new Promise<number>(() => {});
}
