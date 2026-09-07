import {
	getLogger,
	LOG_LEVELS,
	Logger,
	type LogLevel,
	type LogWriter,
} from 'atolla_core/src/services/Logger';
import { PlaybackStore } from 'atolla_player/src/stores/Playback';
import { makeFileKeyValueStore, type StoreFiles } from './FileKeyValueStore';
import { helloBody } from './Hello';
import type { HttpServer } from './Http';
import { PAIRING_KEY } from './Pairing';
import { type PlayerConfig, secretsDir, stateDir } from './PlayerConfig';
import type { PlayerIdentity } from './PlayerIdentity';
import type { RandomBytes } from './Random';
import { attachServer } from './Server';

export interface DaemonDeps {
	config: PlayerConfig;
	files: StoreFiles;
	httpServer: HttpServer;
	identity: PlayerIdentity;
	log: LogWriter;
	logLevel: LogLevel;
	randomBytes: RandomBytes;
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

	const secrets = secretsDir(deps.config);

	// Before the queue is restored, so a bad port fails fast and the server answers while a large
	// queue is still being read.
	deps.httpServer.setLogLevel(deps.logLevel);
	deps.httpServer.setHelloBody(helloBody(deps.identity));
	deps.httpServer.setPairingCodePath(`${secrets}/${PAIRING_KEY}`);
	attachServer(deps.httpServer, {
		pair: {
			randomBytes: deps.randomBytes,
			secrets: makeFileKeyValueStore(deps.files, secrets),
		},
	});
	log.info('listening', {
		host: deps.config.bindAddress,
		port: deps.httpServer.start(deps.config.bindAddress, deps.config.port),
	});

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
