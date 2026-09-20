import { describe, expect, it } from 'bun:test';
import type { Track } from 'atolla_core/src/models/Track';
import { PlaybackStore } from 'atolla_player/src/stores/Playback';
import type { AudioEngine } from './Audio';
import { type AudioPlayer, makeAudioPlayer } from './AudioPlayer';
import type { ResolvedSource } from './SourceResolver';

function track(id: string): Track {
	return { duration: 180, id, name: `track ${id}` };
}

const TRACKS = [track('t1'), track('t2'), track('t3')];

interface FakeEngine extends AudioEngine {
	cleared: number;
	configured: Array<{ authHeader: string; source: string; trackId: string }>;
	events: Array<string>;
	playing: boolean;
	position: number;
	seeks: Array<number>;
}

function fakeEngine(): FakeEngine {
	const engine: FakeEngine = {
		clear: () => {
			engine.cleared++;
			engine.configured.length = 0;
		},
		cleared: 0,
		configure: (source: string, trackId: string, authHeader: string) => {
			engine.configured.push({ authHeader, source, trackId });
			engine.position = 0;
			return true;
		},
		configured: [],
		consumeEvent: () => engine.events.shift() ?? '',
		currentTrackId: () => engine.configured[engine.configured.length - 1]?.trackId ?? '',
		events: [],
		playing: false,
		position: 0,
		positionMs: () => engine.position,
		seeks: [],
		seekToMs: (positionMs: number) => {
			engine.seeks.push(positionMs);
			engine.position = positionMs;
			return true;
		},
		setPlaying: (playing: boolean) => {
			engine.playing = playing;
		},
		start: () => true,
	};

	return engine;
}

function fixture(
	resolve: (trackId: string) => ResolvedSource | null = (id) => ({
		authHeader: '',
		source: `/media/${id}`,
	}),
): {
	audio: FakeEngine;
	player: AudioPlayer;
	playback: PlaybackStore;
} {
	const audio = fakeEngine();
	const playback = new PlaybackStore();
	const player = makeAudioPlayer({
		audio,
		playback,
		resolveSource: (given: Track) => resolve(given.id),
	});

	player.start();

	return { audio, playback, player };
}

describe('makeAudioPlayer', () => {
	it('binds the current track and starts it when the queue plays', () => {
		const { audio, playback } = fixture();

		playback.playTracks(TRACKS, 0);

		expect(audio.configured).toEqual([{ authHeader: '', source: '/media/t1', trackId: 't1' }]);
		expect(audio.playing).toBe(true);
	});

	it('leaves a track the engine already holds alone', () => {
		const { audio, playback } = fixture();

		playback.playTracks(TRACKS, 0);
		playback.playPause();
		playback.playPause();

		expect(audio.configured).toHaveLength(1);
	});

	// A credential arriving changes nothing the playback store can notify about, so without refresh
	// the listener has to press play a second time for the track they already asked for.
	it('picks the held track up on a refresh, with nothing touching the queue', () => {
		let resolved: ResolvedSource | null = null;
		const { audio, player, playback } = fixture(() => resolved);

		playback.playTracks(TRACKS, 0);

		expect(audio.configured).toHaveLength(0);

		resolved = { authHeader: 'MediaBrowser Token="abc"', source: 'https://demo/Audio/t1/stream' };
		player.refresh();

		expect(audio.configured).toHaveLength(1);
		expect(audio.playing).toBe(true);
	});

	// No credential survives a restart, so the restored track resolves to nothing until one is pushed.
	it('binds the restored track once its credential arrives', () => {
		let resolved: ResolvedSource | null = null;
		const { audio, playback } = fixture(() => resolved);

		playback.playTracks(TRACKS, 0);
		playback.playPause();

		expect(audio.configured).toHaveLength(0);

		resolved = { authHeader: 'MediaBrowser Token="abc"', source: 'https://demo/Audio/t1/stream' };
		playback.playPause();

		expect(audio.configured).toEqual([
			{
				authHeader: 'MediaBrowser Token="abc"',
				source: 'https://demo/Audio/t1/stream',
				trackId: 't1',
			},
		]);
		expect(audio.playing).toBe(true);
	});

	// A pushed credential replaces the transport behind the resolver, so a track paused on the old
	// token would play it and be refused.
	it('binds a paused track again once it resolves differently', () => {
		let resolved: ResolvedSource = {
			authHeader: 'MediaBrowser Token="old"',
			source: 'https://demo/Audio/t1/stream',
		};
		const { audio, playback } = fixture(() => resolved);

		playback.playTracks(TRACKS, 0);
		playback.playPause();

		resolved = { authHeader: 'MediaBrowser Token="new"', source: 'https://demo/Audio/t1/stream' };
		playback.playPause();

		expect(audio.configured[audio.configured.length - 1]).toEqual({
			authHeader: 'MediaBrowser Token="new"',
			source: 'https://demo/Audio/t1/stream',
			trackId: 't1',
		});
		expect(audio.playing).toBe(true);
	});

	it('leaves a paused track alone while it resolves the same way', () => {
		const { audio, player, playback } = fixture();

		playback.playTracks(TRACKS, 0);
		playback.playPause();
		player.tick();
		player.tick();

		expect(audio.configured).toHaveLength(1);
	});

	it('keeps a playing track on the source it started with', () => {
		let resolved: ResolvedSource = { authHeader: '', source: '/media/t1' };
		const { audio, player, playback } = fixture(() => resolved);

		playback.playTracks(TRACKS, 0);
		resolved = { authHeader: 'MediaBrowser Token="abc"', source: 'https://demo/Audio/t1/stream' };
		audio.position = 5_000;
		player.tick();

		expect(audio.configured).toEqual([{ authHeader: '', source: '/media/t1', trackId: 't1' }]);
	});

	it('binds the next track when the queue moves on', () => {
		const { audio, playback } = fixture();

		playback.playTracks(TRACKS, 0);
		playback.next();

		expect(audio.configured[audio.configured.length - 1]).toEqual({
			authHeader: '',
			source: '/media/t2',
			trackId: 't2',
		});
	});

	it('pushes pause and play down', () => {
		const { audio, playback } = fixture();

		playback.playTracks(TRACKS, 0);
		playback.playPause();

		expect(audio.playing).toBe(false);

		playback.playPause();

		expect(audio.playing).toBe(true);
	});

	it('seeks when a controller asks for a position', () => {
		const { audio, playback } = fixture();

		playback.playTracks(TRACKS, 0);
		playback.seekTo(42);

		expect(audio.seeks).toEqual([42_000]);
	});

	it('seeks again when the same position is asked for twice', () => {
		const { audio, player, playback } = fixture();

		playback.playTracks(TRACKS, 0);
		playback.seekTo(42);
		player.tick();
		playback.seekTo(42);

		expect(audio.seeks).toEqual([42_000, 42_000]);
	});

	it('reads the engine position into the store', () => {
		const { audio, player, playback } = fixture();

		playback.playTracks(TRACKS, 0);
		audio.position = 30_000;
		player.tick();

		expect(playback.progressSeconds).toBe(30);
	});

	it('ignores a position belonging to another track', () => {
		const { audio, player, playback } = fixture();

		playback.playTracks(TRACKS, 0);
		audio.configured.push({ authHeader: '', source: '/media/other', trackId: 'other' });
		audio.position = 30_000;
		player.tick();

		expect(playback.progressSeconds).toBe(0);
	});

	it('advances past the track the engine says it finished', () => {
		const { audio, player, playback } = fixture();

		playback.playTracks(TRACKS, 0);
		audio.events.push('completed:t1');
		player.tick();

		expect(playback.trackIndex).toBe(1);
		expect(audio.configured[audio.configured.length - 1]?.trackId).toBe('t2');
	});

	it('settles buffered completions without binding the tracks in between', () => {
		const { audio, player, playback } = fixture();

		playback.playTracks(TRACKS, 0);
		audio.events.push('completed:t1', 'completed:t2');
		player.tick();

		expect(playback.trackIndex).toBe(2);
		expect(audio.configured).toHaveLength(2);
		expect(audio.configured[1]?.trackId).toBe('t3');
	});

	it('advances past a track the engine could not play', () => {
		const { audio, player, playback } = fixture();

		playback.playTracks(TRACKS, 0);
		audio.events.push('error:unknown:t1:Resource not found');
		player.tick();

		expect(playback.trackIndex).toBe(1);
	});

	it('stops rather than walking the queue when every track fails', () => {
		const { audio, player, playback } = fixture();

		playback.playTracks(TRACKS, 0);
		audio.events.push(
			'error:network:t1:Not authorized',
			'error:network:t2:Not authorized',
			'error:network:t3:Not authorized',
		);
		player.tick();

		expect(playback.trackIndex).toBe(2);
		expect(playback.isPlaying).toBe(false);
	});

	it('gives the queue a fresh run when the listener presses play again', () => {
		const { audio, player, playback } = fixture();

		playback.playTracks([...TRACKS, track('t4')], 0);
		audio.events.push(
			'error:network:t1:Not authorized',
			'error:network:t2:Not authorized',
			'error:network:t3:Not authorized',
		);
		player.tick();
		playback.playPause();

		audio.events.push('error:network:t3:Not authorized');
		player.tick();

		expect(playback.trackIndex).toBe(3);
		expect(playback.isPlaying).toBe(true);
	});

	it('counts only failures in a row, so an occasional bad track still advances', () => {
		const { audio, player, playback } = fixture();

		playback.playTracks(TRACKS, 0);
		audio.events.push('error:network:t1:Not authorized');
		player.tick();

		audio.position = 4_000;
		player.tick();

		audio.events.push('error:network:t2:Not authorized');
		player.tick();

		expect(playback.trackIndex).toBe(2);
		expect(playback.isPlaying).toBe(true);
	});

	it('hands the engine the credential the source was resolved with', () => {
		const { audio, playback } = fixture((id) => ({
			authHeader: 'MediaBrowser Token="abc"',
			source: `https://demo.jellyfin.local/Audio/${id}/stream.mp3`,
		}));

		playback.playTracks(TRACKS, 0);

		expect(audio.configured).toEqual([
			{
				authHeader: 'MediaBrowser Token="abc"',
				source: 'https://demo.jellyfin.local/Audio/t1/stream.mp3',
				trackId: 't1',
			},
		]);
	});

	it('follows the engine when it jumps somewhere of its own', () => {
		const { audio, player, playback } = fixture();

		playback.playTracks(TRACKS, 0);
		audio.events.push('jumped:t3');
		player.tick();

		expect(playback.trackIndex).toBe(2);
	});

	it('stops asking the engine for events once the queue is drained', () => {
		const { audio, player, playback } = fixture();

		playback.playTracks(TRACKS, 0);
		audio.events.push('completed:t1');
		player.tick();
		player.tick();

		expect(playback.trackIndex).toBe(1);
	});

	it('clears the engine when the queue empties', () => {
		const { audio, playback } = fixture();

		playback.playTracks(TRACKS, 0);
		playback.stop();

		expect(audio.cleared).toBe(1);
	});

	it('leaves the engine alone when nothing resolves the track to bytes', () => {
		const { audio, playback } = fixture(() => null);

		playback.playTracks(TRACKS, 0);

		expect(audio.configured).toHaveLength(0);
	});

	it('reports what the engine holds for a restore to follow', () => {
		const { audio, player, playback } = fixture();

		expect(player.currentNativeTrack()).toBeNull();

		playback.playTracks(TRACKS, 0);
		audio.position = 12_000;

		expect(player.currentNativeTrack()).toEqual({ positionSeconds: 12, trackId: 't1' });
	});

	it('stops following the store once disposed', () => {
		const { audio, player, playback } = fixture();

		player.dispose();
		playback.playTracks(TRACKS, 0);

		expect(audio.configured).toHaveLength(0);
	});
});
