import { getLogger, Logger, type LogWriter } from 'atolla_core/src/services/Logger';
import { PlaybackStore } from 'atolla_player/src/stores/Playback';
import { makeFileKeyValueStore, type StoreFiles } from './FileKeyValueStore';
import type { PlayerConfig } from './PlayerConfig';

export interface DaemonDeps {
	config: PlayerConfig;
	files: StoreFiles;
	log: LogWriter;
}

export async function startDaemon(deps: DaemonDeps): Promise<number> {
	Logger.setWriter(deps.log);

	const log = getLogger('daemon');
	log.info('started', { dataDir: deps.config.dataDir, name: deps.config.name });

	const state = `${deps.config.dataDir}/state`;
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
