import type { Track } from 'atolla_core/src/models/Track';
import { getLogger } from 'atolla_core/src/services/Logger';
import {
	type LoopMode,
	LoopModes,
	type PlaybackStore,
	PlayheadMoves,
} from 'atolla_player/src/stores/Playback';
import type {
	Command,
	CommandSetQueue,
	Hello,
	StreamKeyAnswer,
} from 'atolla_sync/src/api/generated';
import type { PlayerClient } from 'atolla_sync/src/api/PlayerClient';
import { hostOf } from '../models/Player';
import type { PlayersStore } from '../stores/Players';

const log = getLogger('speaker-output');

export type SpeakerClient = Pick<PlayerClient, 'command' | 'hello' | 'streamKey'>;

export interface SpeakerOutputOptions {
	createClient: (baseUrl: string) => SpeakerClient;
	playbackStore: PlaybackStore;
	playersStore: PlayersStore;
	userId: () => string;
}

interface Speaker {
	client: SpeakerClient;
	currentTrackId: string | null;
	driving: boolean;
	host: string;
	id: string;
	isPlaying: boolean;
	joinedTo: Speaker | null;
	loopMode: LoopMode;
	nextTrackId: string | null;
	playheadRevision: number;
	queueIndex: number;
	sending: Promise<void>;
	token: string;
}

export class SpeakerOutput {
	private source: Speaker | null = null;
	private readonly speakers = new Map<string, Speaker>();
	private unsubscribes: Array<() => void> = [];

	constructor(private readonly options: SpeakerOutputOptions) {}

	dispose(): void {
		for (const unsubscribe of this.unsubscribes) {
			unsubscribe();
		}
		this.unsubscribes = [];
		this.source = null;
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

		const next = store.nextTrack;
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
			if (store.isPlaying || !this.queueRanOut()) {
				this.send(speaker, { command: store.isPlaying ? 'play' : 'pause' });
			}
			speaker.isPlaying = store.isPlaying;
		}

		if (store.loopMode !== speaker.loopMode) {
			this.send(speaker, { command: 'setLoopMode', loopMode: store.loopMode });
			speaker.loopMode = store.loopMode;
		}
	}

	private join(member: Speaker, source: Speaker): void {
		if (member.driving) {
			this.send(member, { command: 'pause' });
			member.driving = false;
		}

		if (member.joinedTo === source) {
			return;
		}

		member.joinedTo = source;
		void this.joinSource(member, source);
	}

	private async joinSource(member: Speaker, source: Speaker): Promise<void> {
		const greeted = await Promise.resolve(source.client.hello()).catch(() => null);
		if (!this.stillJoining(member, source)) {
			return;
		}

		if (greeted === null || greeted.status !== 200) {
			log.warn('could not greet the source, so the speaker cannot join it', { host: source.host });
			return;
		}

		const { audioPort } = greeted.json as Hello;
		if (audioPort === undefined) {
			log.warn('the source streams no audio, so the speaker cannot join it', { host: source.host });
			return;
		}

		const keyed = await Promise.resolve(source.client.streamKey(source.token)).catch(() => null);
		if (!this.stillJoining(member, source)) {
			return;
		}

		if (keyed === null || keyed.status !== 200) {
			log.warn('could not get the stream key from the source, so the speaker cannot join it', {
				host: source.host,
			});
			return;
		}

		const { key } = keyed.json as StreamKeyAnswer;
		this.send(member, { command: 'joinSource', host: source.host, key, port: audioPort });
	}

	private lead(speaker: Speaker): void {
		if (speaker.driving) {
			this.follow(speaker);
			return;
		}

		if (speaker.joinedTo !== null) {
			this.send(speaker, { command: 'joinSource' });
			speaker.joinedTo = null;
		}

		speaker.driving = true;
		this.restart(speaker);
	}

	private owner(): { userId?: string } {
		const userId = this.options.userId();
		return userId === '' ? {} : { userId };
	}

	private queueRanOut(): boolean {
		const store = this.options.playbackStore;
		const track = store.track;

		return store.nextTrack === null && track !== null && store.progressSeconds >= track.duration;
	}

	private release(speaker: Speaker): void {
		if (speaker.driving) {
			this.send(speaker, { command: 'pause' });
		} else if (speaker.joinedTo !== null) {
			this.send(speaker, { command: 'joinSource' });
		}
	}

	private restart(speaker: Speaker): void {
		const store = this.options.playbackStore;
		const current = store.track;
		const next = store.nextTrack;
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

	private stillJoining(member: Speaker, source: Speaker): boolean {
		return (
			this.speakers.get(member.id) === member &&
			member.joinedTo === source &&
			this.source === source
		);
	}

	private sync = (): void => {
		const playersStore = this.options.playersStore;
		const enabled = playersStore.enabledSpeakers();
		const enabledIds = new Set(enabled.map((player) => player.id));

		for (const [id, speaker] of this.speakers) {
			if (!enabledIds.has(id)) {
				this.release(speaker);
				this.speakers.delete(id);
			}
		}

		for (const player of enabled) {
			const token = playersStore.tokenFor(player.id);
			if (this.speakers.has(player.id) || player.baseUrl === null || token === undefined) {
				continue;
			}

			this.speakers.set(player.id, {
				client: this.options.createClient(player.baseUrl),
				currentTrackId: null,
				driving: false,
				host: hostOf(player.baseUrl),
				id: player.id,
				isPlaying: false,
				joinedTo: null,
				loopMode: LoopModes.none,
				nextTrackId: null,
				playheadRevision: -1,
				queueIndex: 0,
				sending: Promise.resolve(),
				token,
			});
		}

		const [first, ...members] = enabled.flatMap((player) => this.speakers.get(player.id) ?? []);
		if (first === undefined) {
			this.source = null;
			return;
		}

		this.source = first;
		this.lead(first);
		for (const member of members) {
			this.join(member, first);
		}
	};
}
