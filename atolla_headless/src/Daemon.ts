import {
	getLogger,
	LOG_LEVELS,
	Logger,
	type LogLevel,
	type LogWriter,
} from 'atolla_core/src/services/Logger';
import { PlaybackStore } from 'atolla_player/src/stores/Playback';
import type { AudioEngine } from './Audio';
import { makeAudioPlayer, POLL_INTERVAL_MS } from './AudioPlayer';
import { makeFileKeyValueStore, type StoreFiles } from './FileKeyValueStore';
import { helloBody } from './Hello';
import type { HttpServer } from './Http';
import { makeMediaServerCredentials } from './MediaServerCredentials';
import { type MakeHttpClient, makeMediaServerTransports } from './MediaServerTransports';
import { CONTROLLERS_KEY, PAIRING_KEY } from './Pairing';
import { type PlayerConfig, secretsDir, stateDir } from './PlayerConfig';
import type { PlayerIdentity } from './PlayerIdentity';
import { makeQueueOwner } from './QueueOwner';
import type { RandomBytes } from './Random';
import { attachServer } from './Server';
import { makeSourceResolver } from './SourceResolver';
import { makeStateVersion, playbackSignature } from './StateVersion';

export interface DaemonDeps {
	audio: AudioEngine;
	config: PlayerConfig;
	files: StoreFiles;
	httpServer: HttpServer;
	identity: PlayerIdentity;
	log: LogWriter;
	logLevel: LogLevel;
	makeHttpClient: MakeHttpClient;
	now: () => number;
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

	const secrets = makeFileKeyValueStore(deps.files, secretsDir(deps.config));
	const state = stateDir(deps.config);
	const playback = new PlaybackStore();
	const version = makeStateVersion();
	const credentials = makeMediaServerCredentials(version);
	const queueOwner = makeQueueOwner(makeFileKeyValueStore(deps.files, state));
	const transports = makeMediaServerTransports({
		credentials,
		identity: deps.identity,
		makeHttpClient: deps.makeHttpClient,
	});

	const audioPlayer = makeAudioPlayer({
		audio: deps.audio,
		playback,
		resolveSource: makeSourceResolver({
			config: deps.config,
			files: deps.files,
			queueOwner,
			transports,
		}),
	});

	if (deps.audio.start(deps.config.audioDevice)) {
		audioPlayer.start();
		setInterval(audioPlayer.tick, POLL_INTERVAL_MS);
		log.info('audio ready', { device: deps.config.audioDevice });
	} else {
		log.warn('audio unavailable', { device: deps.config.audioDevice });
	}

	let mirrored = playbackSignature(playback);

	playback.subscribe(() => {
		const next = playbackSignature(playback);
		if (next === mirrored) {
			return;
		}

		mirrored = next;
		version.bump();
	});

	// A command waits on the restore rather than the restore delaying the server. It is started on
	// a later turn than this one because `setPersistence` reads synchronously before it yields, so
	// starting it here would put a large queue's read ahead of the listen below.
	const restored = Promise.resolve().then(async () => {
		await playback.setPersistence({
			progress: makeFileKeyValueStore(deps.files, state),
			queue: makeFileKeyValueStore(deps.files, state),
		});
		await queueOwner.load();

		log.info('queue restored', {
			owner: queueOwner.get(),
			trackIndex: playback.trackIndex,
			tracks: playback.tracks.length,
		});
	});

	// Before the queue is restored, so a bad port fails fast and the server answers while a large
	// queue is still being read.
	deps.httpServer.setLogLevel(deps.logLevel);
	deps.httpServer.setHelloBody(helloBody(deps.identity));
	deps.httpServer.setControllersPath(secrets.pathFor(CONTROLLERS_KEY));
	deps.httpServer.setPairingCodePath(secrets.pathFor(PAIRING_KEY));
	attachServer(deps.httpServer, {
		command: {
			playback,
			queueOwner,
			restored,
			version,
		},
		mediaServer: {
			credentials,
			transports,
			version,
		},
		pair: {
			credentials,
			randomBytes: deps.randomBytes,
			secrets,
			transports,
		},
		state: {
			credentials,
			identity: deps.identity,
			now: deps.now,
			playback,
			queueOwner,
			restored,
			version,
		},
	});
	log.info('listening', {
		host: deps.config.bindAddress,
		port: deps.httpServer.start(deps.config.bindAddress, deps.config.port),
	});

	await restored;

	return new Promise<number>(() => {});
}
