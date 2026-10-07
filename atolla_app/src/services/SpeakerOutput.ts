import type { Track } from 'atolla_core/src/models/Track';
import { getLogger } from 'atolla_core/src/services/Logger';
import {
	type LoopMode,
	LoopModes,
	type PlaybackStore,
	PlayheadMoves,
} from 'atolla_player/src/stores/Playback';
import type { Command, CommandSetQueue } from 'atolla_sync/src/api/generated';
import type { PlayerClient } from 'atolla_sync/src/api/PlayerClient';
import type { PlayersStore } from '../stores/Players';

const log = getLogger('speaker-output');

export type SpeakerClient = Pick<PlayerClient, 'command'>;

export interface SpeakerOutputOptions {
	createClient: (baseUrl: string) => SpeakerClient;
	playbackStore: PlaybackStore;
	playersStore: PlayersStore;
	userId: () => string;
}

interface Speaker {
	client: SpeakerClient;
	currentTrackId: string | null;
	isPlaying: boolean;
	loopMode: LoopMode;
	nextTrackId: string | null;
	playheadRevision: number;
	queueIndex: number;
	sending: Promise<void>;
	token: string;
}

export class SpeakerOutput {
	private readonly speakers = new Map<string, Speaker>();
	private unsubscribes: Array<() => void> = [];

	constructor(private readonly options: SpeakerOutputOptions) {}

	dispose(): void {
		for (const unsubscribe of this.unsubscribes) {
			unsubscribe();
		}
		this.unsubscribes = [];
	}

	start(): void {
		this.unsubscribes = [
			this.options.playbackStore.subscribe(this.sync),
			this.options.playersStore.subscribe(this.sync),
		];
		void this.options.playersStore.ensureLoaded().then(this.sync);
	}

	private follow(speaker: Speaker): void {
		const store = this.options.playbackStore;

		if (store.playheadRevision !== speaker.playheadRevision) {
			speaker.playheadRevision = store.playheadRevision;
			const trackId = store.track?.id ?? null;
			const finished = store.playheadMove === PlayheadMoves.finished;
			const speakerRepeated = finished && trackId === speaker.currentTrackId;
			const speakerMovedOn = finished && trackId !== null && trackId === speaker.nextTrackId;
			const sameTrack = trackId !== null && trackId === speaker.currentTrackId;

			if (speakerMovedOn) {
				speaker.queueIndex += 1;
				speaker.currentTrackId = trackId;
				speaker.nextTrackId = null;
			} else if (sameTrack && !speakerRepeated) {
				this.send(speaker, {
					command: 'seek',
					positionMs: Math.round(store.progressSeconds * 1000),
				});
			} else if (!speakerRepeated) {
				this.restart(speaker);
				return;
			}
		}

		const next = this.nextTrack();
		const nextTrackId = next?.id ?? null;
		if (nextTrackId !== speaker.nextTrackId) {
			if (speaker.nextTrackId !== null) {
				this.send(speaker, {
					command: 'removeAt',
					trackId: speaker.nextTrackId,
					trackIndex: speaker.queueIndex + 1,
				});
			}
			if (next !== null) {
				this.send(speaker, { command: 'addToQueue', tracks: [{ ...next }], ...this.owner() });
			}
			speaker.nextTrackId = nextTrackId;
		}

		if (store.isPlaying !== speaker.isPlaying) {
			this.send(speaker, { command: store.isPlaying ? 'play' : 'pause' });
			speaker.isPlaying = store.isPlaying;
		}

		if (store.loopMode !== speaker.loopMode) {
			this.send(speaker, { command: 'setLoopMode', loopMode: store.loopMode });
			speaker.loopMode = store.loopMode;
		}
	}

	private nextTrack(): Track | null {
		const store = this.options.playbackStore;
		const following = store.tracks[store.trackIndex + 1];
		if (following !== undefined) {
			return following;
		}
		if (store.loopMode === LoopModes.queue) {
			return store.tracks[0] ?? null;
		}
		return null;
	}

	private owner(): { userId?: string } {
		const userId = this.options.userId();
		return userId === '' ? {} : { userId };
	}

	private restart(speaker: Speaker): void {
		const store = this.options.playbackStore;
		const current = store.track;
		const next = this.nextTrack();
		const tracks = [current, next].filter((track): track is Track => track !== null);

		this.send(speaker, this.setQueue(tracks));
		this.send(speaker, { command: 'setLoopMode', loopMode: store.loopMode });
		if (current !== null && store.progressSeconds > 0) {
			this.send(speaker, {
				command: 'seek',
				positionMs: Math.round(store.progressSeconds * 1000),
			});
		}
		if (!store.isPlaying) {
			this.send(speaker, { command: 'pause' });
		}

		speaker.currentTrackId = current?.id ?? null;
		speaker.isPlaying = store.isPlaying;
		speaker.loopMode = store.loopMode;
		speaker.nextTrackId = next?.id ?? null;
		speaker.playheadRevision = store.playheadRevision;
		speaker.queueIndex = 0;
	}

	private send(speaker: Speaker, command: Command): void {
		log.debug('sending a command', { command: command.command });
		speaker.sending = speaker.sending
			.then(() => speaker.client.command(speaker.token, command))
			.then((answer) => {
				if (answer.status >= 300) {
					log.warn('speaker refused a command', {
						command: command.command,
						status: answer.status,
					});
				}
			})
			.catch((error: unknown) => {
				log.warn('speaker command failed', { command: command.command, error: String(error) });
			});
	}

	private setQueue(tracks: Array<Track>): CommandSetQueue {
		const album = this.options.playbackStore.album;
		return {
			...(album === null ? {} : { album: { ...album } }),
			command: 'setQueue',
			trackIndex: 0,
			tracks: tracks.map((track) => ({ ...track })),
			...this.owner(),
		};
	}

	private sync = (): void => {
		const playersStore = this.options.playersStore;
		const enabled = playersStore.enabledSpeakers();
		const enabledIds = new Set(enabled.map((player) => player.id));

		for (const [id, speaker] of this.speakers) {
			if (!enabledIds.has(id)) {
				this.send(speaker, { command: 'pause' });
				this.speakers.delete(id);
			}
		}

		for (const player of enabled) {
			const existing = this.speakers.get(player.id);
			if (existing !== undefined) {
				this.follow(existing);
				continue;
			}

			const token = playersStore.tokenFor(player.id);
			if (player.baseUrl === null || token === undefined) {
				continue;
			}

			const speaker: Speaker = {
				client: this.options.createClient(player.baseUrl),
				currentTrackId: null,
				isPlaying: false,
				loopMode: LoopModes.none,
				nextTrackId: null,
				playheadRevision: -1,
				queueIndex: 0,
				sending: Promise.resolve(),
				token,
			};
			this.speakers.set(player.id, speaker);
			this.restart(speaker);
		}
	};
}
